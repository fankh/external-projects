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
  // menus.ts 의 roles 는 권한 단일 원천 — 공유 참조를 그대로 반환하면 향후 호출자가 정렬·push 로
  // 원본을 오염시킬 수 있으므로 항상 새 배열로 복사해 돌려준다(현 호출자는 모두 읽기 전용, 방어적).
  if (!override) return [...item.roles]
  return item.roles.filter((r) => r === 'ADMIN' || override.includes(r))
}

/** 메뉴 기준 화면 가드 — 페이지가 역할 목록을 중복 선언하지 않고 menus.ts 단일 원천을 따른다.
 *  런타임 제한(메뉴권한 화면)이 있으면 즉시 반영된다. */
export async function requireMenu(href: string): Promise<Session> {
  return requireRole(...effectiveRoles(href))
}

/** 화면 소속 서버 액션 가드 — 액션 자체의 역할 요건 ∩ 소속 화면의 유효 권한.
 *  서버 액션은 UI 노출과 무관하게 직접 POST 가 가능하므로, 화면 런타임 제한이 쓰기에도 걸리게 한다. */
export async function requireMenuRole(href: string, ...roles: Role[]): Promise<Session> {
  const eff = effectiveRoles(href)
  return requireRole(...roles.filter((r) => eff.includes(r)))
}
