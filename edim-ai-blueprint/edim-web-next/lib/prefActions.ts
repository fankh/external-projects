'use server'

import { apiServer, ApiError } from '@/lib/api'

/** GET /prefs/{key} — 서버 저장 UI 프리퍼런스(그리드 컬럼 등). 미설정/불가 시 null. */
export async function getPref<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await apiServer<{ value: T | null }>(`/prefs/${encodeURIComponent(key)}`)
    return r.value ?? null
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** PUT /prefs/{key} — 서버 저장. 성공 여부 반환(false=백엔드 불가, 로컬 캐시로 폴백). */
export async function setPref(key: string, value: unknown): Promise<boolean> {
  try {
    await apiServer(`/prefs/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) })
    return true
  } catch (e) {
    if (e instanceof ApiError) return false
    throw e
  }
}
