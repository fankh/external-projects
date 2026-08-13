import { redirect } from 'next/navigation'
import { NAV } from '@/components/chrome/menus'
import { getSession, type Session } from './session'
import { getStore } from './store'
import type { Role } from './types'

/** 화면 단위 서버사이드 권한 게이트 — 내비 숨김과 별개로 직접 URL 진입을 차단한다.
 *  미로그인 → /login, 권한 밖 → /dashboard (권한·접근통제 모델 §02) */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!roles.includes(session.role)) redirect('/dashboard')
  return session
}

/** 메뉴의 유효 권한 — menus.ts 기본 권한 ∩ 런타임 제한(메뉴권한 화면, 요구사항 72행).
 *  제한은 축소만 가능해 권한 상승이 원천 차단되고, ADMIN 은 잠금 방지를 위해 제한 대상에서 제외된다. */
export function effectiveRoles(href: string): Role[] {
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href)
  if (!item) return []
  const override = getStore().menuOverrides[href]
  if (!override) return item.roles
  return item.roles.filter((r) => r === 'ADMIN' || override.includes(r))
}

/** 메뉴 기준 화면 가드 — 페이지가 역할 목록을 중복 선언하지 않고 menus.ts 단일 원천을 따른다.
 *  런타임 제한(메뉴권한 화면)이 있으면 즉시 반영된다. */
export async function requireMenu(href: string): Promise<Session> {
  return requireRole(...effectiveRoles(href))
}
