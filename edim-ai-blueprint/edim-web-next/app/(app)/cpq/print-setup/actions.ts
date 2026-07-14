'use server'

import { apiServer, ApiError } from '@/lib/api'

/** Print Form 게시 승인 요청 (CPQ-013). */
export async function publishForm(form: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/approvals', { method: 'POST', body: JSON.stringify({ targetTable: 'doc_control', targetId: 0, requestType: 'UPDATE', label: `Print Form 게시 — ${form}`, targetCode: form }) })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}
