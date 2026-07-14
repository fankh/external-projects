'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** 데이터 번역 저장(빈 값=삭제). */
export async function saveTranslation(entityType: string, entityId: number, locale: string, value: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/i18n/data', { method: 'PUT', body: JSON.stringify({ entityType, entityId, locale, value }) })
    revalidatePath('/code/data-i18n')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}
