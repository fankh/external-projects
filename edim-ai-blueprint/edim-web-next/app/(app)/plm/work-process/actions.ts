'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** MAKE/BUY 저장 (도면 자재행). */
export async function saveMakeBuy(code: string, items: { item: string; makeOrBuy: string }[]): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/erp/work-process', { method: 'PUT', body: JSON.stringify({ code, items }) })
    revalidatePath('/plm/work-process')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}
