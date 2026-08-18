'use server'
import { revalidatePath } from 'next/cache'
import { WITHDRAW_RESTORERS, isWithdrawableDocType } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { requireMenuRole } from '@/lib/authz'
import { ACCOUNTS } from '@/lib/session'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

/** 회전참조 묶음 문서의 반려 시점 항목 id 목록 — 배치를 구성한 항목(참조가 아직 살아있는 상태)을
 *  모아 재상신 할일에 남긴다. 재상신이 이 항목을 재포함해야만 할일이 닫혀 과다 마감을 막는다(AP3-3).
 *  비묶음 문서는 undefined 를 돌려주고, 호출부는 batchItems 필드를 생략한다. */
function batchItemsOf(s: ReturnType<typeof getStore>, docType: string, ref: string): string[] | undefined {
  if (docType === '장애보고 상신') return s.incidents.filter((i) => i.reportRef === ref).map((i) => i.id)
  if (docType === '출력물폐기 상신') return s.printouts.filter((p) => p.approvalRef === ref).map((p) => p.id)
  if (docType === '서약 현황 상신') return s.companyPledges.filter((c) => c.approvalRef === ref).map((c) => c.id)
  return undefined
}

/** 결재 처리 — 승인·반려는 참조 업무(ref)의 상태로 전파되고, 내 '결재' 할일을 닫는다.
 *  결재자 본인 여부를 서버에서 재검증한다(화면 숨김과 별개의 가드). */
async function decide(formData: FormData, verdict: '승인' | '반려') {
  const me = await requireMenuRole('/work/approvals', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  // 반려는 사유 필수 — 기안자가 보완·재상신할 근거가 된다
  if (verdict === '반려' && !reason) return
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === id)
  if (!ap || ap.approver !== me.name || ap.status !== '대기') return

  // 다단 결재 — 중간 단계 승인은 다음 결재자로 회부하고 업무 전파 없이 종료한다 (반려는 어느 단계든 즉시 반려)
  if (verdict === '승인' && ap.queue && ap.queue.length > 0) {
    const next = ap.queue[0]
    ap.queue = ap.queue.length > 1 ? ap.queue.slice(1) : undefined
    audit(me.name, '결재 승인', `${ap.id} ${ap.docType} — ${ap.title} (중간 승인 → ${next} 회부)`)
    const myTodo = s.todos.find((t) => t.owner === me.name && t.kind === '결재' && t.title.startsWith(`${id} `) && !t.done)
    if (myTodo) myTodo.done = true
    ap.approver = next
    s.todos.unshift({
      id: nextNo('TD', today().slice(0, 4), s.todos.map((t) => t.id)),
      owner: next, kind: '결재', title: `${ap.id} 결재 처리`, dueDate: today(), done: false,
    })
    revalidatePath('/', 'layout')
    return
  }

  ap.status = verdict
  ap.decidedAt = today()
  ap.queue = undefined  // 반려 시 잔여 단계는 무의미 — 상세·엑셀이 유령 단계를 표기하지 않도록 정리 (F5)
  if (verdict === '반려') ap.rejectReason = reason
  audit(me.name, verdict === '승인' ? '결재 승인' : '결재 반려',
    `${ap.id} ${ap.docType} — ${ap.title}${verdict === '반려' ? ` (사유: ${reason})` : ''}`)

  // 폐쇄 루프 3 — 반려는 기안자에게 '재상신' 할일로 되돌아간다 (전 문서 유형 공통).
  // 문서 유형 태그를 제목에 남겨 할일 바로가기·재상신 시 자동 마감의 매칭 키로 쓴다.
  // ref 있는 문서만 재상신 할일 — ref 없는 결재는 되돌릴 업무가 없어 재상신 경로 자체가 없다.
  // (draftApproval 은 항상 ref 를 채우므로 실 문서엔 영향 없고, ref 로 제목을 구성해 재상신 시
  //  draftApproval 의 닫기 매칭(유형+ref 선두 고정)이 정확히 이 할일을 닫을 수 있게 한다.)
  if (verdict === '반려' && ap.ref) {
    // 회전참조 묶음 문서는 반려된 묶음의 항목 id 를 재상신 할일에 남긴다 — 재상신(같은 항목 재제출)이
    // 이 항목을 재포함할 때만 draftApproval 이 이 할일을 닫아, 무관한 신규 묶음 상신의 과다 마감을 막는다
    // (AP3-3). 이 블록은 아래 상태 전파(reportRef/approvalRef 초기화)보다 먼저 실행돼 참조가 아직 살아있다.
    const batchItems = batchItemsOf(s, ap.docType, ap.ref)
    s.todos.unshift({
      id: nextNo('TD', today().slice(0, 4), s.todos.map((t) => t.id)),
      owner: ap.drafter, kind: '재상신',
      title: `[${ap.docType}] ${ap.ref} 반려 — 보완 후 재상신 (사유: ${reason})`,
      dueDate: today(), done: false,
      ...(batchItems && batchItems.length > 0 ? { batchItems } : {}),
    })
  }

  // 폐쇄 루프 1 — SR 신청 결재가 SR 진행 상태로 전파된다 (승인 → CI배정, 반려 → 반려)
  if (ap.docType === 'SR 신청' && ap.ref) {
    const sr = s.srRequests.find((r) => r.srNo === ap.ref)
    if (sr && sr.status === '결재중') {
      sr.status = verdict === '승인' ? 'CI배정' : '반려'
      // 승인 시 업무담당(BIZ_MGR)에게 'SR 처리'(CI 배정) 할일 생성 — assignCi(sr/ci)가 배정과 함께 닫는다.
      // (기존엔 생성부가 없어 assignCi 의 마감 루프가 반쪽이었음 — 시드 TD-104 와 동일 형태)
      if (verdict === '승인') {
        const owner = ACCOUNTS.find((a) => a.role === 'BIZ_MGR')?.name
        if (owner) s.todos.unshift({
          id: nextNo('TD', today().slice(0, 4), s.todos.map((t) => t.id)),
          owner, kind: 'SR 처리', title: `${sr.srNo} CI 배정`, dueDate: today(), done: false,
        })
      }
    }
  }

  // 폐쇄 루프 1-9 — 적용요청서 결재 (결재 시트 5번, 신청 상신과 별개): 승인 → 적용요청(변경 편입 대기), 반려 → 테스트
  if (ap.docType === '적용요청 상신' && ap.ref) {
    const sr = s.srRequests.find((r) => r.srNo === ap.ref)
    if (sr && sr.status === '적용요청결재중') sr.status = verdict === '승인' ? '적용요청' : '테스트'
  }

  // 폐쇄 루프 1-2 — 정산품의(투자·비용) 결재가 지급 상태로 전파되어 실적·속보 기준금액에 반영된다
  if ((ap.docType === '투자 정산품의' || ap.docType === '비용 정산품의') && ap.ref) {
    const st = s.settlements.find((x) => x.id === ap.ref)
    if (st && st.status === '결재중') st.status = verdict === '승인' ? '지급완료' : '반려'
  }

  // 폐쇄 루프 1-3 — 장애보고 결재가 보고서에 묶인 장애 건 전체의 보고 상태로 전파된다
  if (ap.docType === '장애보고 상신' && ap.ref) {
    for (const inc of s.incidents.filter((i) => i.reportRef === ap.ref && i.reportStatus === '결재중')) {
      if (verdict === '승인') {
        inc.reportStatus = '결재완료'
      } else {
        inc.reportStatus = '미상신'
        inc.reportRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-4 — 변경 계획·결과 상신은 각 1회씩. 결과 승인 시 시스템개발 변경은 매칭 SR을 완료로 전파한다
  if (ap.docType === '변경계획 상신' && ap.ref) {
    const cw = s.changes.find((c) => c.id === ap.ref)
    if (cw && cw.status === '계획결재중') cw.status = verdict === '승인' ? '작업등록승인' : '작업등록'
  }
  if (ap.docType === '변경결과 상신' && ap.ref) {
    const cw = s.changes.find((c) => c.id === ap.ref)
    if (cw && cw.status === '작업완료결재중') {
      cw.status = verdict === '승인' ? '최종완료' : '작업등록승인'
      if (verdict === '승인' && cw.kind === '시스템개발' && cw.srNo) {
        const sr = s.srRequests.find((r) => r.srNo === cw.srNo)
        if (sr && sr.status === '적용요청') {
          sr.status = '완료'
          sr.completedAt = today()
        }
      }
    }
  }

  // 폐쇄 루프 1-6 — 출력물폐기 결재가 상신 묶음 전체의 폐기확정으로 전파된다
  if (ap.docType === '출력물폐기 상신' && ap.ref) {
    for (const row of s.printouts.filter((p) => p.approvalRef === ap.ref && p.status === '결재중')) {
      if (verdict === '승인') {
        row.status = '폐기확정'
      } else {
        row.status = '등록'
        row.approvalRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-8 — 협력업체 서약 상신 결재가 묶인 징구 건 전체로 전파된다
  if (ap.docType === '서약 현황 상신' && ap.ref) {
    for (const c of s.companyPledges.filter((x) => x.approvalRef === ap.ref && x.status === '결재중')) {
      if (verdict === '승인') {
        c.status = '완료'
      } else {
        c.status = '등록'
        c.approvalRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-7 — 보안위반 확인서 결재가 위반 건 상태로 전파된다 (승인 → 완료, 반려 → 징구중)
  if (ap.docType === '보안위반 확인서' && ap.ref) {
    const v = s.violations.find((x) => x.id === ap.ref)
    if (v && v.status === '결재중') v.status = verdict === '승인' ? '완료' : '징구중'
  }

  // 폐쇄 루프 1-5 — 점검결과 결재가 점검 진행내역 현황판(계획·미등록·완료 집계)으로 전파된다
  if (ap.docType === '점검결과 상신' && ap.ref) {
    const plan = s.inspectionPlans.find((x) => x.id === ap.ref)
    if (plan && plan.status === '결재중') plan.status = verdict === '승인' ? '완료' : '결과미등록'
  }

  // 폐쇄 루프 2 — 내 할일 목록의 해당 결재 건이 자동으로 닫힌다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '결재' && t.title.startsWith(`${id} `) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

export async function approve(formData: FormData) {
  await decide(formData, '승인')
}

export async function reject(formData: FormData) {
  await decide(formData, '반려')
}

/** 상신취소(회수) — 기안자 본인이 결재 대기 문서를 거둬들인다 (요구사항 결재 시트의 상신취소 전이).
 *  반려와 달리 '재상신' 할일을 만들지 않고, 참조 업무를 상신 이전 상태로 되돌린다 —
 *  기안자는 업무 화면에서 보완 후 처음 상신과 같은 경로로 다시 상신한다. */
export async function withdraw(formData: FormData) {
  const me = await requireMenuRole('/work/approvals', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === id)
  // 기안자 본인 + 결재 대기 + 상신취소 허용 유형만 — 화면 숨김과 별개의 서버 가드
  if (!ap || ap.drafter !== me.name || ap.status !== '대기' || !isWithdrawableDocType(ap.docType)) return
  const docType = ap.docType  // WithdrawableDocType 로 좁혀짐(가드 통과) — const 로 확정해 복원기 인덱싱

  ap.status = '회수'
  ap.decidedAt = today()
  ap.queue = undefined  // 회수 시 잔여 단계 정리 (F5)
  audit(me.name, '결재 회수', `${ap.id} ${ap.docType} — ${ap.title}`)

  // 참조 업무 상태 복원 — 유형별 복원 로직은 lib/approvals 의 WITHDRAW_RESTORERS 단일 원천이다.
  // Record<WithdrawableDocType, …> 라 회수 가능 유형을 늘리면 복원 핸들러 누락이 컴파일 에러로 잡혀,
  // 참조 업무가 '결재중'에 갇히는 고아 in-flight 를 원천 차단한다(각 복원기는 진행중 상태에서만 되돌린다).
  if (ap.ref) WITHDRAW_RESTORERS[docType](s, ap.ref)

  // 회수된 문서는 결재자의 처리 대상에서 빠진다 — '결재' 할일을 닫는다
  const todo = s.todos.find((t) => t.owner === ap.approver && t.kind === '결재' && t.title.startsWith(`${id} `) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}
