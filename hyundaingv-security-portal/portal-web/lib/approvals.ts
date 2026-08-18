/** 결재 상신 공통 로직 — 문서 유형별 기본 결재선(환경설정 > 결재선 관리)에서 결재자를 해석한다.
 *  기안자 본인이 결재자면 시스템관리자(그마저 본인이면 업무담당)로 대체해 자기 결재를 막는다.
 *  상신과 동시에 결재자에게 '결재' 할일이 생긴다 — 전 도메인 공통 폐쇄 루프. */
import { ACCOUNTS } from './session'
import { audit } from './audit'
import { today } from './dates'
import { getStore, nextNo, type Store } from './store'
import type { ApprovalDocType } from './types'

/** 묶음(회전 참조) 문서 — 재상신마다 새 묶음 번호를 받아 참조가 회전하는 유형.
 *  참조 번호 대신 문서 유형·기안자로 회차를 잇는다 (재상신 할일 닫기 · 이전 회차 이력). */
// '부서서약 현황 상신'은 회전에서 제외한다(v1.5.84) — 부서 상태는 무상태 스냅샷이라 매 상신이 fresh 이고
// 재상신 전용 액션이 없어, 개수기반 회전 닫기가 '반려와 무관한 일상 상신'에도 발화해 타 부서의 반려 재상신
// 할일을 과다마감(반려방치 알림 영구 소실)했다. ref 를 부서명(안정 per-item 키)으로 두어 exact 닫기(비회전
// 경로)로 그 부서 할일만 정확히 닫는다. 나머지 3종(장애·출력물·서약현황)은 배치 조성이 가변이라 회전 유지.
export const ROTATING_DOC_TYPES: ApprovalDocType[] = ['장애보고 상신', '출력물폐기 상신', '서약 현황 상신']

/** 상신취소(회수) 가능 유형 — 요구사항 결재 시트가 상신취소 전이를 명시한 문서만
 *  (SR 3종 → 임시저장, 변경 계획/결과 → 작업등록/작업등록승인, 확인서 → 징구중). */
export type WithdrawableDocType = 'SR 신청' | '적용요청 상신' | '변경계획 상신' | '변경결과 상신' | '보안위반 확인서'

/** 회수 시 참조 업무를 상신 직전 단계로 되돌리는 유형별 복원기 — 회수 액션의 단일 원천.
 *  Record<WithdrawableDocType, …> 라 회수 가능 유형(WithdrawableDocType)을 늘리면 여기 복원 핸들러
 *  누락이 컴파일 에러로 잡힌다 — 참조 업무가 '결재중'에 갇히는 고아 in-flight 를 타입으로 원천 차단한다.
 *  각 복원기는 상신 직후의 진행중 상태일 때만 되돌린다(경합·중복 회수 방어, 승인/반려 전파와 동일 가드). */
export const WITHDRAW_RESTORERS: Record<WithdrawableDocType, (s: Store, ref: string) => void> = {
  'SR 신청': (s, ref) => {
    const sr = s.srRequests.find((r) => r.srNo === ref)
    if (sr && sr.status === '결재중') sr.status = '작성중'
  },
  '적용요청 상신': (s, ref) => {
    const sr = s.srRequests.find((r) => r.srNo === ref)
    if (sr && sr.status === '적용요청결재중') sr.status = '테스트'
  },
  '변경계획 상신': (s, ref) => {
    const cw = s.changes.find((c) => c.id === ref)
    if (cw && cw.status === '계획결재중') cw.status = '작업등록'
  },
  '변경결과 상신': (s, ref) => {
    const cw = s.changes.find((c) => c.id === ref)
    if (cw && cw.status === '작업완료결재중') cw.status = '작업등록승인'
  },
  '보안위반 확인서': (s, ref) => {
    const v = s.violations.find((x) => x.id === ref)
    if (v && v.status === '결재중') v.status = '징구중'
  },
}

/** 상신취소 가능 유형 목록 — 복원 맵의 키에서 파생(단일 원천). 화면 노출·서버 가드가 공유한다. */
export const WITHDRAWABLE_DOC_TYPES: readonly ApprovalDocType[] = Object.keys(WITHDRAW_RESTORERS) as WithdrawableDocType[]

/** 회수 가능 유형 타입가드 — 통과 시 ApprovalDocType 을 WithdrawableDocType 으로 좁혀 복원기 인덱싱을
 *  캐스트 없이 안전하게 한다(복원 맵 키 존재 = 회수 가능). */
export function isWithdrawableDocType(t: ApprovalDocType): t is WithdrawableDocType {
  return t in WITHDRAW_RESTORERS
}

export function draftApproval(opts: {
  docType: ApprovalDocType
  title: string
  ref: string
  drafter: { name: string; dept: string }
  /** 회전참조 묶음 문서 상신 시 현재 묶음의 항목 id 목록 — 재상신 할일을 항목 재포함 기준으로
   *  정밀 마감하기 위해 넘긴다(무관 신규 묶음의 과다마감 방지, AP3-3). 비묶음 문서는 생략. */
  items?: string[]
}): string {
  const s = getStore()
  const biz = ACCOUNTS.find((a) => a.role === 'BIZ_MGR')!
  const adm = ACCOUNTS.find((a) => a.role === 'ADMIN')!

  // 자기 결재 방지 — 기안자 본인이 결재자면 대체한다 (단계별 공통)
  const resolve = (name: string) =>
    name === opts.drafter.name ? (opts.drafter.name === adm.name ? biz.name : adm.name) : name

  const line = s.approvalLines.find((l) => l.docType === opts.docType)
  // 다단 결재 (제품안내서 IV장) — 결재선의 1차·2차를 순서대로 회부. 자기결재 대체 후
  // 같은 사람이 연속되면 한 단계로 합친다.
  const chain = [resolve(line?.approver ?? biz.name), ...(line?.secondApprover ? [resolve(line.secondApprover)] : [])]
    .filter((name, i, arr) => i === 0 || name !== arr[i - 1])
  const approver = chain[0]
  const queue = chain.slice(1)

  const year = today().slice(0, 4)
  const apId = nextNo('AP', year, s.approvals.map((a) => a.id))
  s.approvals.unshift({
    id: apId, docType: opts.docType, title: opts.title,
    drafter: opts.drafter.name, dept: opts.drafter.dept, approver,
    status: '대기', draftedAt: today(), ref: opts.ref,
    queue: queue.length > 0 ? queue : undefined,
  })
  s.todos.unshift({
    id: nextNo('TD', year, s.todos.map((t) => t.id)),
    owner: approver, kind: '결재', title: `${apId} 결재 처리`, dueDate: today(), done: false,
  })
  // 승인·반려만 남던 감사 이력에 상신을 더해 결재 생명주기 전체를 추적한다
  audit(opts.drafter.name, '결재 상신', `${apId} ${opts.docType} — ${opts.title} (결재자 ${approver})`)

  // 폐쇄 루프 — 반려로 생긴 기안자의 '재상신' 할일은 재상신과 함께 닫힌다.
  //  · 비묶음 문서: 참조 번호 일치로 그 할일을 정확히 닫는다.
  //  · 묶음 문서(장애·출력물·서약): 재상신마다 새 묶음 번호를 받아 참조가 회전한다. 문서 유형으로 매칭하되,
  //    v1.5.88 부터 '반려 묶음 항목(batchItems)의 재포함' 기준으로 정밀 마감한다 — 현재 상신 항목(opts.items)이
  //    그 할일의 batchItems 를 하나라도 포함할 때만 닫아, 반려와 무관한 신규 묶음 상신이 오래된 재상신 할일을
  //    과다 마감(반려방치 알림 영구 소실, AP3-3)하지 않게 한다. 항목정보 없는 레거시 경로는 개수일치(1건) 폴백.
  const isRotating = ROTATING_DOC_TYPES.includes(opts.docType)
  let rotatingClosed = false
  // s.todos 는 unshift 로 최신이 앞 — 오래된 것부터 닫으려 뒤에서부터 훑는다.
  for (let i = s.todos.length - 1; i >= 0; i--) {
    const t = s.todos[i]
    if (t.done || t.kind !== '재상신') continue
    // 재상신 할일 제목은 `[유형] ref 반려 — … (사유: <자유 텍스트>)` 형식이다. 부분문자열
    // includes(ref) 로 매칭하면 (a) 반려 사유에 다른 건의 ref 가 인용되면 그 무관한 할일이
    // 닫히고(예: SR-B 사유에 'SR-A' 언급 → SR-A 재상신이 SR-B 할일까지 마감), (b) 유형이 달라도
    // 같은 ref 를 쓰는 문서(SR 신청↔적용요청, 변경계획↔변경결과)가 교차 마감된다. 유형+ref 를
    // 제목 선두 위치에 고정 매칭해 사유 텍스트·타 유형을 배제한다(빈 ref 는 이 패턴에 안 걸린다).
    // 비회전 문서는 소유자 일치도 요구한다 — 공유 워크스페이스 교차 재상신자는 페이지 레벨 소유자무관
    // 닫기(SR submitApply·변경 closeChangeResignTodo·점검 registerResult)가 담당한다.
    if (opts.ref && t.owner === opts.drafter.name && t.title.startsWith(`[${opts.docType}] ${opts.ref} `)) { t.done = true; continue }
    // 회전 문서(장애보고·서약현황·출력물폐기)는 재상신마다 ref 가 바뀌어 참조 일치가 불가능하다 —
    // (부서서약은 v1.5.84 에서 ref=부서명 안정키로 비회전화돼 위 ref-exact 경로로 닫힌다) —
    // 소유자 무관하게 닫아 공유 관리자 워크스페이스의 교차 재상신자 고아 할일·'반려 방치' 무한 알림을 막되,
    // v1.5.88: 재상신 할일의 반려 묶음 항목(batchItems)을 현재 상신 항목(opts.items)이 재포함할 때만 닫는다.
    // 이렇게 하면 반려와 무관한 '신규' 묶음 상신이 오래된 재상신 할일을 과다 마감하던 결함(AP3-3)이 사라지고,
    // 여러 묶음을 한 번에 재상신하면 겹치는 할일을 정확히 모두 닫는다. 항목정보가 없는 레거시 할일·상신은
    // 종전 개수일치(가장 오래된 1건, 소유자무관) 동작으로 폴백한다(회귀 방지).
    if (isRotating && t.title.startsWith(`[${opts.docType}]`)) {
      if (opts.items && t.batchItems) {
        if (t.batchItems.some((id) => opts.items!.includes(id))) t.done = true
      } else if (!rotatingClosed) { t.done = true; rotatingClosed = true }
    }
  }
  return apId
}
