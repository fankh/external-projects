'use server'

import { apiServer, ApiError } from '@/lib/api'

/** doc_control 상태 전이 (Set-up→Check→Approve→Accepted). */
export async function advanceStatus(docNo: string, status: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer(`/documents/${encodeURIComponent(docNo)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '상태 전이 실패' }
  }
}
