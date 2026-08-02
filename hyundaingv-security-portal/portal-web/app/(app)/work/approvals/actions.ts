'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'

/** 결재 처리 — 승인·반려는 참조 업무(ref)의 상태로 전파되고, 내 '결재' 할일을 닫는다.
 *  결재자 본인 여부를 서버에서 재검증한다(화면 숨김과 별개의 가드). */
async function decide(formData: FormData, verdict: '승인' | '반려') {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === id)
  if (!ap || ap.approver !== me.name || ap.status !== '대기') return

  ap.status = verdict
  ap.decidedAt = today()

  // 폐쇄 루프 1 — SR 신청 결재가 SR 진행 상태로 전파된다 (승인 → CI배정, 반려 → 반려)
  if (ap.docType === 'SR 신청' && ap.ref) {
    const sr = s.srRequests.find((r) => r.srNo === ap.ref)
    if (sr && sr.status === '결재중') sr.status = verdict === '승인' ? 'CI배정' : '반려'
  }

  // 폐쇄 루프 2 — 내 할일 목록의 해당 결재 건이 자동으로 닫힌다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '결재' && t.title.includes(id) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

export async function approve(formData: FormData) {
  await decide(formData, '승인')
}

export async function reject(formData: FormData) {
  await decide(formData, '반려')
}
