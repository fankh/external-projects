'use server'
import { revalidatePath } from 'next/cache'
import { APPROVAL_PROPAGATORS, WITHDRAW_RESTORERS, isWithdrawableDocType } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { requireMenuRole } from '@/lib/authz'
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
    // 중간 승인자 이력 기록 — approver 를 next 로 덮기 전에 이 단계 결재자를 남긴다(§VI 추적성, B1).
    // 이후 이 결재자는 inbox·상세에서 자기가 처리한 결재를 계속 볼 수 있다(현재 approver 가 아니어도).
    ap.approvedBy = [...(Array.isArray(ap.approvedBy) ? ap.approvedBy : []), me.name]
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

  // 폐쇄 루프 1 — 결재 승인/반려가 참조 업무 상태로 전파된다. 유형별 전파는 lib/approvals 의
  // APPROVAL_PROPAGATORS 단일 원천(Record<ApprovalDocType,…>)이라, 새 결재 유형 추가 시 전파 핸들러
  // 누락이 컴파일 에러로 잡혀 승인됐는데 참조 업무가 '결재중'에 갇히는 고아 in-flight 를 원천 차단한다.
  // 문서 유형은 상호배타라 호출당 정확히 하나 실행('부서서약 현황 상신'은 무상태 스냅샷 → 명시적 no-op).
  if (ap.ref) APPROVAL_PROPAGATORS[ap.docType](s, ap.ref, verdict)

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
