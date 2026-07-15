'use server'

/** 수주 관리 뮤테이션 (N3) — 견적 lifecycle 전이 (SENT/ORDERED/LOST), 수주 시 후속 TODO 자동. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface ActState { error?: string; ok?: string }

export async function transitionQuotation(
  id: number, status: 'SENT' | 'ORDERED' | 'LOST',
  contractAmount?: number, expectedDelivery?: string,
): Promise<ActState> {
  try {
    const r = await apiServer<{ status: string; followupEvents?: { code: string; name: string }[] }>(
      `/cost/quotations/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, contractAmount, expectedDelivery }) })
    revalidatePath('/erp/sales-order')
    const follow = r.followupEvents?.length ? ` · 후속 착수 ${r.followupEvents.length}건 생성` : ''
    return { ok: `#${id} → ${r.status}${follow}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '전이 실패' }
  }
}
