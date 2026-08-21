import { redirect } from 'next/navigation'
import { NAV, SCREEN_ACTIONS, ACTION_LABEL, TITLE_BY_HREF, isGrantableMenu, type ActionKey } from '@/components/chrome/menus'
import { getSession, type Session } from './session'
import { getStore } from './store'
import { today } from './dates'
import type { Role, UserGroup } from './types'

/** 그룹 위임이 현재 유효한가 — 만료일(expiresAt) 미지정이면 무기한 유효, 지정 시 오늘 이하일 때만 유효.
 *  읽기 시점 판정이라 만료된 그룹은 열람·기능 위임을 일절 부여하지 않는다(fail-closed 자동 회수). */
export function isGroupActive(grp: UserGroup): boolean {
  return !grp.expiresAt || today() <= grp.expiresAt
}

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
    if (!grp.members.includes(name) || !isGroupActive(grp)) continue
    for (const h of grp.menuGrants) if (isGrantableMenu(h)) hrefs.add(h)
    // 액션(쓰기) 위임도 해당 화면 열람을 함께 연다 — 위임받은 기능을 쓰려면 화면에 진입해야 한다.
    // 쓰기 경로(groupGrantsAction)와 동일하게 isGrantableAction 로 액션 키 전체를 검증한다 — 손상·위조
    // 데이터의 미등록 액션 키(예: `/infra/racks#save`)로 열람만 열리는 비대칭을 없앤다(fail-closed 대칭).
    for (const key of grp.actionGrants ?? []) {
      const [h, a] = key.split('#')
      if (h && a && isGrantableAction(h, a as ActionKey)) hrefs.add(h)
    }
  }
  return [...hrefs]
}

/** 이 계정이 그룹 위임으로 해당 메뉴를 열람할 수 있는가 — ADMIN 전용 화면은 항상 false(권한 상승 차단).
 *  메뉴 위임뿐 아니라 그 화면의 액션 위임을 받아도 열람이 열린다(액션을 쓰려면 화면 진입 필요). */
export function groupGrantsMenu(name: string, href: string): boolean {
  if (!isGrantableMenu(href)) return false
  // 액션 위임 분기도 isGrantableAction 로 액션 키를 검증한다(groupGrantedMenus·쓰기 경로와 대칭) —
  // 미등록 액션 키가 열람만 여는 비대칭 제거. isGrantableMenu(href) 는 위에서 확정됨. 만료 그룹은 제외.
  return (getStore().userGroups ?? []).some((g) => g.members.includes(name) && isGroupActive(g)
    && (g.menuGrants.includes(href)
      || (g.actionGrants ?? []).some((k) => {
        const [h, a] = k.split('#')
        return h === href && !!a && isGrantableAction(href, a as ActionKey)
      })))
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

/** 그룹 위임으로 부여 가능한(운영) 쓰기 기능인가 — SCREEN_ACTIONS 등록 액션 && 부여 가능한 운영 화면.
 *  ADMIN 화면·미등록 액션은 위임 불가(권한 상승 차단). menuGrants 의 isGrantableMenu 와 동일 규약. */
export function isGrantableAction(href: string, action: ActionKey): boolean {
  return !!SCREEN_ACTIONS[href]?.[action] && isGrantableMenu(href)
}

/** 이 계정이 그룹 위임으로 해당 기능(쓰기)을 수행할 수 있는가 — 부여 가능 액션만 인정한다. 읽기 시점에
 *  isGrantableAction 로 필터하므로 손상·위조 데이터가 admin 화면·미등록 액션을 위임해도 무시된다(fail-closed). */
export function groupGrantsAction(name: string, href: string, action: ActionKey): boolean {
  if (!isGrantableAction(href, action)) return false
  const key = `${href}#${action}`
  return (getStore().userGroups ?? []).some((g) => g.members.includes(name) && isGroupActive(g) && (g.actionGrants ?? []).includes(key))
}

/** 이 계정에 그룹 위임된 기능 키(`${href}#${action}`) 목록 — 부여 가능 액션만. 내비 배너·UI 표시용. */
export function groupGrantedActions(name: string): string[] {
  const keys = new Set<string>()
  for (const grp of getStore().userGroups ?? []) {
    if (!grp.members.includes(name) || !isGroupActive(grp)) continue
    for (const key of grp.actionGrants ?? []) {
      const [h, a] = key.split('#')
      if (h && a && isGrantableAction(h, a as ActionKey)) keys.add(key)
    }
  }
  return [...keys]
}

export interface DelegationEntry { member: string; kind: '열람' | '기능'; target: string; group: string; expiresAt?: string }

/** 위임 현황 대장 — 현재 유효한(만료 안 된) 그룹의 위임을 구성원 단위로 펼친 접근검토 목록(누가·무엇을·어느
 *  그룹으로·언제까지). 화면(/settings/groups)과 엑셀 export 가 이 단일 원천을 공유해 드리프트를 막는다.
 *  만료 그룹 제외·부여 가능 대상(isGrantableMenu·isGrantableAction)만·구성원/유형/대상 순 정렬. */
export function groupDelegationRegister(): DelegationEntry[] {
  const reg: DelegationEntry[] = []
  for (const g of getStore().userGroups ?? []) {
    if (!isGroupActive(g)) continue
    for (const m of g.members) {
      for (const h of g.menuGrants) if (isGrantableMenu(h)) reg.push({ member: m, kind: '열람', target: TITLE_BY_HREF[h]?.title ?? h, group: g.label, expiresAt: g.expiresAt })
      for (const k of g.actionGrants ?? []) {
        const [h, a] = k.split('#')
        if (h && a && isGrantableAction(h, a as ActionKey)) reg.push({ member: m, kind: '기능', target: `${TITLE_BY_HREF[h]?.title ?? h} · ${ACTION_LABEL[a as ActionKey]}`, group: g.label, expiresAt: g.expiresAt })
      }
    }
  }
  return reg.sort((x, y) => x.member.localeCompare(y.member) || x.kind.localeCompare(y.kind) || x.target.localeCompare(y.target))
}

/** 기능 수행 가능 여부(단일 술어) — 역할 유효 기능권한 OR 그룹 액션 위임. requireAction(강제)과 UI 표시가
 *  이 술어 하나를 공유한다. 그룹 위임은 SCREEN_ACTIONS 등록 액션(운영 화면)만 넓히고, admin 화면 쓰기는
 *  requireMenu/requireMenuRole 가 별도로 막으므로 관리 기능으로 새지 않는다. */
export function canPerformAction(session: Session, href: string, action: ActionKey): boolean {
  return effectiveActionRoles(href, action).includes(session.role) || groupGrantsAction(session.name, href, action)
}

/** 화면×기능 서버 액션 가드 — requireMenuRole 의 기능 버전. SCREEN_ACTIONS 에 등록된 기능만 이 가드로 보호되며,
 *  역할 유효권한 또는 그룹 액션 위임이 있으면 통과한다. 오버라이드·그룹 변경이 즉시 반영된다. 직접 POST 도 걸린다.
 *  미로그인 → /login, 권한 밖 → /dashboard. */
export async function requireAction(href: string, action: ActionKey): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (canPerformAction(session, href, action)) return session
  redirect('/dashboard')
}
