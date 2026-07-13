/** 세션 — httpOnly 쿠키에 FastAPI 토큰 저장(SSR fetch 시 서버가 사용). */
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'edim_session'
export const LOCALE_COOKIE = 'edim_locale'

export interface SessionUser {
  userId: string
  name: string
  department: string
  userLevel: string
  tenantId: string
}

/** 서버 컴포넌트/액션에서 현재 토큰 조회 */
export async function getToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(SESSION_COOKIE)?.value ?? null
}

export async function getLocale(): Promise<'ko' | 'en' | 'ja' | 'zh'> {
  const jar = await cookies()
  const v = jar.get(LOCALE_COOKIE)?.value
  return v === 'en' || v === 'ja' || v === 'zh' ? v : 'ko'
}
