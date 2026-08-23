import { redirect } from 'next/navigation'
import { getSession, type Session } from './session'
import { canViewMenu } from './perm'
import type { Role } from './types'

/** 화면 단위 서버사이드 권한 게이트 — 사이드바 숨김과 별개로 직접 URL 진입을 차단한다.
 *  미로그인 → /login, 권한 밖 → /dashboard (권한·접근통제 모델 §02) */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!roles.includes(session.role)) redirect('/dashboard')
  return session
}


/** 화면 가드(매트릭스 반영) — 라우트 역할 목록과 권한 매트릭스의 '조회' 칸을 **둘 다** 만족해야 진입한다.
 *  매트릭스는 필요조건이라 켠다고 역할 규칙을 넘지 못하고, 빼면 실제로 막힌다(제품안내서 §02 의 약속).
 *  href 는 그 화면의 라우트 — lib/perm 의 ROUTE_MENU 키와 같아야 한다(매핑 없으면 역할 게이트만). */
export async function requireView(href: string, ...roles: Role[]): Promise<Session> {
  const session = await requireRole(...roles)
  if (!canViewMenu(href, session.role)) redirect('/dashboard')
  return session
}