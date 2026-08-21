import { redirect } from 'next/navigation'
import { NAV, SCREEN_ACTIONS, isGrantableMenu, type ActionKey } from '@/components/chrome/menus'
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

/** 사용자 그룹으로 이 계정에 열람 위임된 메뉴 href 목록 — 구성원인 그룹들의 부여 메뉴 합집합.
 *  ADMIN 전용 화면 위임은 무시한다(isGrantableMenu). 세션 쿠키가 아니라 스토어에서 실시간 해석하므로
 *  관리자가 그룹을 바꾸면 재로그인 없이 즉시 반영된다. */
export function groupGrantedMenus(name: string): string[] {
  const hrefs = new Set<string>()
  for (const grp of getStore().userGroups ?? []) {
    if (!grp.members.includes(name)) continue
    for (const h of grp.menuGrants) if (isGrantableMenu(h)) hrefs.add(h)
  }
  return [...hrefs]
}

/** 이 계정이 그룹 위임으로 해당 메뉴를 열람할 수 있는가 — ADMIN 전용 화면은 항상 false(권한 상승 차단). */
export function groupGrantsMenu(name: string, href: string): boolean {
  if (!isGrantableMenu(href)) return false
  return (getStore().userGroups ?? []).some((g) => g.members.includes(name) && g.menuGrants.includes(href))
}

/** 화면 열람 가능 여부(단일 술어) — 역할 유효권한 OR 그룹 위임. 내비 표시(layout·AppShell)와 서버 가드
 *  (requireMenu)가 이 술어 하나를 공유해 표시와 강제가 어긋나지 않는다. 쓰기 액션은 여전히 역할 게이트
 *  (requireMenuRole·requireAction)가 막으므로 그룹 위임은 '열람'만 넓힌다. */
export function canAccessMenu(session: Session, href: string): boolean {
  return effectiveRoles(href).includes(session.role) || groupGrantsMenu(session.name, href)
}

/** 메뉴 기준 화면 가드 — 페이지가 역할 목록을 중복 선언하지 않고 menus.ts 단일 원천을 따른다.
 *  역할 유효권한 또는 사용자 그룹 열람 위임이 있으면 통과한다. 런타임 제한(메뉴권한 화면)·그룹 변경이
 *  즉시 반영된다. 미로그인 → /login, 권한 밖 → /dashboard. */
export async function requireMenu(href: string): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (canAccessMenu(session, href)) return session
  redirect('/dashboard')
}

/** 화면 소속 서버 액션 가드 — 액션 자체의 역할 요건 ∩ 소속 화면의 유효 권한.
 *  서버 액션은 UI 노출과 무관하게 직접 POST 가 가능하므로, 화면 런타임 제한이 쓰기에도 걸리게 한다. */
export async function requireMenuRole(href: string, ...roles: Role[]): Promise<Session> {
  const eff = effectiveRoles(href)
  return requireRole(...roles.filter((r) => eff.includes(r)))
}

/** 화면×기능 유효 권한 — SCREEN_ACTIONS 기본 ∩ 화면 유효권한 ∩ 기능 런타임 제한(actionOverrides).
 *  기본 원천이 SCREEN_ACTIONS 하나라 requireAction(강제)과 권한 매트릭스(표시)가 어긋나지 않는다. 축소만
 *  가능해 권한 상승 불가, ADMIN 은 잠금 방지로 제한 대상 제외. 카탈로그 미등록 기능은 빈 배열(=아무도 불가). */
export function effectiveActionRoles(href: string, action: ActionKey): Role[] {
  const base = SCREEN_ACTIONS[href]?.[action]
  if (!base) return []
  const eff = new Set(effectiveRoles(href))
  const scoped = base.filter((r) => eff.has(r))
  const override = getStore().actionOverrides[`${href}#${action}`]
  if (!override) return scoped
  return scoped.filter((r) => r === 'ADMIN' || override.includes(r))
}

/** 화면×기능 서버 액션 가드 — requireMenuRole 의 기능 버전. SCREEN_ACTIONS 에 등록된 기능만 이 가드로 보호되며,
 *  오버라이드가 없으면 기본 역할 집합과 동일하게 동작(마이그레이션 시 회귀 없음). 직접 POST 도 기능 제한이 걸린다. */
export async function requireAction(href: string, action: ActionKey): Promise<Session> {
  return requireRole(...effectiveActionRoles(href, action))
}
