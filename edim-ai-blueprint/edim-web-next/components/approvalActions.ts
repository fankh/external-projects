'use server'

/** U32 — Approval 스트립 공용 액션: 임의 대상 승인 요청 (POST /approvals). */
import { apiServer, ApiError } from '@/lib/api'

export async function requestApprovalGeneric(
  targetTable: string, targetId: number, targetCode: string, label: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/approvals', {
      method: 'POST',
      body: JSON.stringify({ targetTable, targetId, requestType: 'UPDATE', label, targetCode }),
    })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}
