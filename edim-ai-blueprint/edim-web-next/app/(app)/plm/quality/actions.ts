'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface VerifyResult { suggestion: string; evaluated: number; pass: number; fail: number; results: { rule: string; pass: boolean; value: number | null; warning: string | null }[] }

/** 규칙 활성/비활성 토글 (F5). */
export async function toggleRule(verificationId: number, isActive: boolean): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer(`/verifications/${verificationId}`, { method: 'PUT', body: JSON.stringify({ isActive }) })
    revalidatePath('/plm/quality')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패' }
  }
}

/** 측정값 자동 판정 (D4). */
export async function verify(drawing: string, measurements: Record<string, number>): Promise<{ result?: VerifyResult; error?: string }> {
  try {
    const result = await apiServer<VerifyResult>(`/drawings/${encodeURIComponent(drawing)}/verify`, {
      method: 'POST', body: JSON.stringify({ measurements }),
    })
    return { result }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '판정 실패' }
  }
}
