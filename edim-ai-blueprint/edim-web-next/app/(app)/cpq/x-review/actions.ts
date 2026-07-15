'use server'

/** X-code 검토 결재 (N1) — APPROVE/REJECT → x_code_status 전이 + 요청자 알림. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface XReviewState { error?: string; ok?: string }

export async function xReview(selectionId: number, approve: boolean, comment: string): Promise<XReviewState> {
  if (!approve && !comment.trim()) return { error: '반려는 검토 의견이 필요합니다' }
  try {
    const r = await apiServer<{ xCodeStatus: string }>(`/cpq/selections/${selectionId}/x-review`, {
      method: 'POST', body: JSON.stringify({ decision: approve ? 'APPROVE' : 'REJECT', comment }),
    })
    revalidatePath('/cpq/x-review')
    return { ok: `#${selectionId} → ${r.xCodeStatus}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '검토 처리 실패' }
  }
}
