'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** 번역 일괄 Import (XLSX — 헤더 ID·en/ja/zh, 빈 칸=변경 없음). */
export async function importTranslationsExcel(entity: string, formData: FormData): Promise<{ upserted?: number; rejected?: string[]; error?: string }> {
  const { getToken } = await import('@/lib/session')
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: '번역 XLSX 파일을 선택하십시오' }
  const token = await getToken()
  const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'
  try {
    const res = await fetch(`${API_BASE}/i18n/data/${encodeURIComponent(entity)}/import-excel`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: formData,
    })
    const j = await res.json()
    if (!res.ok) return { error: j.detail ?? `HTTP ${res.status}` }
    revalidatePath('/code/data-i18n')
    return { upserted: j.upserted, rejected: j.rejected }
  } catch {
    return { error: '번역 Import 실패' }
  }
}

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
