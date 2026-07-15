'use server'

/** 승인함 결재 뮤테이션 (N1) — 단건/일괄 승인·반려 → revalidatePath. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/common/approval'

export interface DecideState { error?: string; ok?: string }

export async function decide(id: number, approve: boolean, comment: string): Promise<DecideState> {
  if (!approve && !comment.trim()) return { error: '반려는 코멘트가 필요합니다' }
  try {
    await apiServer(`/approvals/${id}/decide`, {
      method: 'POST', body: JSON.stringify({ approve, comment }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '결재 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${id} ${approve ? '승인' : '반려'} 완료` }
}

export async function decideBatch(ids: number[], approve: boolean, comment: string): Promise<DecideState> {
  if (ids.length === 0) return { error: '선택된 요청이 없습니다' }
  if (!approve && !comment.trim()) return { error: '일괄 반려는 코멘트가 필요합니다' }
  try {
    const r = await apiServer<{ processed: number; skipped: number }>('/approvals/decide-batch', {
      method: 'POST', body: JSON.stringify({ approvalIds: ids, approve, comment }),
    })
    revalidatePath(PATH)
    return { ok: `일괄 ${approve ? '승인' : '반려'} — 처리 ${r.processed}건${r.skipped ? ` · 건너뜀 ${r.skipped}건` : ''}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '일괄 결재 실패' }
  }
}
