import { redirect } from 'next/navigation'
import { getSession, type Session } from './session'
import type { Role } from './types'

/** 화면 단위 서버사이드 권한 게이트 — 내비 숨김과 별개로 직접 URL 진입을 차단한다.
 *  미로그인 → /login, 권한 밖 → /dashboard (권한·접근통제 모델 §02) */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!roles.includes(session.role)) redirect('/dashboard')
  return session
}
