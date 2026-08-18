'use server'
/** 투자·비용 공통 재무 액션 — 정산품의 반려 건의 보완 재상신 */
import { revalidatePath } from 'next/cache'
import { draftApproval } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { effectiveRoles, requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

export async function resubmitSettlement(formData: FormData) {
  // 정산품의 재상신은 최초 상신(requestSettlement)과 동일 스코프 — 일반 사용자 제외, 부서담당 이상만
  // (v1.5.42 재무 리포트 잠금과 정합: USER 는 정산 카드·상신에 접근하지 않는다)
  const me = await requireRole('DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  // 기안자 본인의 반려 건만, 해당 품의에 대기 결재가 없을 때만
  const st = s.settlements.find((x) => x.id === id && x.requestedBy === me.name && (x.status === '반려' || x.status === '작성중'))
  if (!st || s.approvals.some((a) => a.ref === id && a.status === '대기')) return

  const contract = s.investContracts.find((c) => c.id === st.contractId)
  if (!contract) return
  // 공용 액션 — 품의가 속한 화면(투자/비용)의 런타임 메뉴 제한을 쓰기에도 적용한다
  if (!effectiveRoles(contract.kind === '투자' ? '/finance/invest' : '/finance/expense').includes(me.role)) return
  const rejected = st.status === '반려'
  st.status = '결재중'
  const docType = contract.kind === '투자' ? '투자 정산품의' : '비용 정산품의'
  draftApproval({
    docType,
    title: `${rejected ? '[재상신] ' : ''}[정산품의-${contract.kind}] ${contract.title} ${st.item} ${st.amount.toLocaleString('ko-KR')}만원`,
    ref: st.id, drafter: me,
  })
  revalidatePath('/', 'layout')
}

/** 정산품의 삭제(폐기) — 요구사항 시트 11·17행 P=삭제. 기안자 본인의 미상신(작성중)·반려 건만 폐기한다.
 *  결재중(대기 결재 존재)·지급완료(집행 확정)는 무결성상 삭제 불가 — 재상신/상신취소 경로로만 처리한다.
 *  삭제는 파괴적 통제 행위라 감사 로그에 남긴다(sibling delete 들과 동일 §VI 정책). */
export async function deleteSettlement(formData: FormData) {
  const me = await requireRole('DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  // 기안자 본인의 작성중·반려 건만. 결재중(대기 결재)·지급완료는 제외 — 상태 가드로 이중 방어.
  const st = s.settlements.find((x) => x.id === id && x.requestedBy === me.name && (x.status === '반려' || x.status === '작성중'))
  if (!st || s.approvals.some((a) => a.ref === id && a.status === '대기')) return
  const contract = s.investContracts.find((c) => c.id === st.contractId)
  if (!contract) return
  // 공용 액션 — 품의가 속한 화면(투자/비용)의 런타임 메뉴 제한을 쓰기에도 적용한다(resubmitSettlement 와 동일)
  if (!effectiveRoles(contract.kind === '투자' ? '/finance/invest' : '/finance/expense').includes(me.role)) return
  // 폐쇄 루프 — 반려 정산은 기안자의 '재상신' 할일을 물고 있다. 재상신이 아니라 폐기(삭제)로 종결하므로 그
  // 할일을 함께 닫는다. 삭제로 품의가 사라지면 재상신(품의 존재 필요)·회전 닫기(같은 ref) 경로가 모두 막혀
  // 할일이 고아로 남고 '반려 방치' 알림이 무한 반복된다(inspection registerResult 와 동일 유형+ref 선두 닫기).
  const docType = contract.kind === '투자' ? '투자 정산품의' : '비용 정산품의'
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[${docType}] ${st.id} `)) t.done = true
  }
  s.settlements = s.settlements.filter((x) => x.id !== id)
  audit(me.name, '정산품의 삭제', `${st.id} ${contract.kind} — ${contract.title} ${st.item} ${st.amount.toLocaleString('ko-KR')}만원 (${st.status})`)
  revalidatePath('/', 'layout')
}
