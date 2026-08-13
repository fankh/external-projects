'use server'
/** 투자·비용 공통 재무 액션 — 정산품의 반려 건의 보완 재상신 */
import { revalidatePath } from 'next/cache'
import { draftApproval } from '@/lib/approvals'
import { effectiveRoles, requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

export async function resubmitSettlement(formData: FormData) {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  // 기안자 본인의 반려 건만, 해당 품의에 대기 결재가 없을 때만
  const st = s.settlements.find((x) => x.id === id && x.requestedBy === me.name && x.status === '반려')
  if (!st || s.approvals.some((a) => a.ref === id && a.status === '대기')) return

  const contract = s.investContracts.find((c) => c.id === st.contractId)
  if (!contract) return
  // 공용 액션 — 품의가 속한 화면(투자/비용)의 런타임 메뉴 제한을 쓰기에도 적용한다
  if (!effectiveRoles(contract.kind === '투자' ? '/finance/invest' : '/finance/expense').includes(me.role)) return
  st.status = '결재중'
  const docType = contract.kind === '투자' ? '투자 정산품의' : '비용 정산품의'
  draftApproval({
    docType,
    title: `[재상신] [정산품의-${contract.kind}] ${contract.title} ${st.item} ${st.amount.toLocaleString('ko-KR')}만원`,
    ref: st.id, drafter: me,
  })
  revalidatePath('/', 'layout')
}
