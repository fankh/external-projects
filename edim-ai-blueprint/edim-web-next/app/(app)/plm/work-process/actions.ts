'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** MAKE/BUY + 공정 파라미터 저장 (U3 — 작업장·인원·Skill·W.Time·창고·재고·비고). */
export async function saveMakeBuy(
  code: string,
  items: { item: string; makeOrBuy: string; workshop?: string; warehouse?: string; minStock?: number; person?: number | null; skill?: string; timeMin?: number | null; remarks?: string }[],
): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/erp/work-process', { method: 'PUT', body: JSON.stringify({ code, items }) })
    revalidatePath('/plm/work-process')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}
