/** 결재 상신 공통 로직 — 문서 유형별 기본 결재선(환경설정 > 결재선 관리)에서 결재자를 해석한다.
 *  기안자 본인이 결재자면 시스템관리자(그마저 본인이면 업무담당)로 대체해 자기 결재를 막는다.
 *  상신과 동시에 결재자에게 '결재' 할일이 생긴다 — 전 도메인 공통 폐쇄 루프. */
import { ACCOUNTS } from './session'
import { audit } from './audit'
import { today } from './dates'
import { getStore, nextNo } from './store'
import type { ApprovalDocType } from './types'

/** 묶음(회전 참조) 문서 — 재상신마다 새 묶음 번호를 받아 참조가 회전하는 유형.
 *  참조 번호 대신 문서 유형·기안자로 회차를 잇는다 (재상신 할일 닫기 · 이전 회차 이력). */
export const ROTATING_DOC_TYPES: ApprovalDocType[] = ['장애보고 상신', '출력물폐기 상신', '서약 현황 상신', '부서서약 현황 상신']

/** 상신취소(회수) 가능 유형 — 요구사항 결재 시트가 상신취소 전이를 명시한 문서만
 *  (SR 3종 → 임시저장, 변경 계획/결과 → 작업등록/작업등록승인, 확인서 → 징구중). */
export const WITHDRAWABLE_DOC_TYPES: ApprovalDocType[] = ['SR 신청', '적용요청 상신', '변경계획 상신', '변경결과 상신', '보안위반 확인서']

export function draftApproval(opts: {
  docType: ApprovalDocType
  title: string
  ref: string
  drafter: { name: string; dept: string }
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
  //  · 묶음 문서(장애·출력물·서약): 재상신마다 새 묶음 번호를 받아 참조가 회전하므로 문서 유형으로
  //    매칭하되, 재상신 1회는 반려 1건에 대응하므로 가장 오래된 것 하나만 닫는다. 같은 유형의
  //    묶음이 여럿 동시에 반려된 경우, 한 번 재상신에 전부 닫혀 잔여 반려의 방치 알림이 사라지는
  //    것을 막는다(할일 자체엔 회차 식별자가 없어 개수 일치만 보장한다).
  const isRotating = ROTATING_DOC_TYPES.includes(opts.docType)
  let rotatingClosed = false
  // s.todos 는 unshift 로 최신이 앞 — 오래된 것부터 닫으려 뒤에서부터 훑는다.
  for (let i = s.todos.length - 1; i >= 0; i--) {
    const t = s.todos[i]
    if (t.done || t.kind !== '재상신' || t.owner !== opts.drafter.name) continue
    // ref 매칭은 opts.ref 가 비어있지 않을 때만 — 빈 문자열이면 includes('') 가 항상 참이라
    // 기안자의 모든 재상신 할일을 한꺼번에 닫아 의무가 조용히 소멸한다(현 호출자는 전부 실 ID 를
    // 넘겨 도달 불가한 잠재 결함이나, 방어적으로 가드). 빈 ref 는 아무 것도 닫지 않는 편이 안전하다.
    if (opts.ref && t.title.includes(opts.ref)) { t.done = true; continue }
    if (isRotating && !rotatingClosed && t.title.startsWith(`[${opts.docType}]`)) { t.done = true; rotatingClosed = true }
  }
  return apId
}
