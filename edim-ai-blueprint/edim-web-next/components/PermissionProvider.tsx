'use client'

/** F3 — 권한 기반 UI 게이팅 (SYS-005). 서버(me+permissions)에서 시드받아 클라 컨텍스트로 제공.
 *  프론트 게이팅은 UX — 서버 RBAC 이 실제 게이트(서비스 재검사 원칙). */
import { createContext, useContext, useMemo, type ReactNode } from 'react'

const LEVEL_RANK: Record<string, number> = { GENERAL: 0, USER: 0, SETUP: 1, ADMIN: 2, PLATFORM: 3 }

export interface PermissionState {
  login: string
  level: string
  perms: Record<string, string> | null
  canWrite: (resourceKey?: string) => boolean
  isAdmin: boolean
  canReadAdmin: boolean
  denyWrite: string
  denyAdmin: string
}

const Ctx = createContext<PermissionState | null>(null)

export function usePermission(): PermissionState {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePermission outside PermissionProvider')
  return v
}

export function PermissionProvider({ login, level, perms, children }: { login: string; level: string; perms: Record<string, string> | null; children: ReactNode }) {
  const value = useMemo<PermissionState>(() => {
    const rank = LEVEL_RANK[level] ?? 0
    return {
      login, level, perms,
      canWrite: (key?: string) => rank >= LEVEL_RANK.SETUP || (!!key && perms?.[key] === 'WRITE'),
      isAdmin: rank >= LEVEL_RANK.ADMIN,
      canReadAdmin: rank >= LEVEL_RANK.SETUP,
      denyWrite: rank >= LEVEL_RANK.SETUP ? '' : '쓰기 권한 없음 — SETUP 이상 또는 역할 매트릭스 WRITE 필요',
      denyAdmin: rank >= LEVEL_RANK.SETUP ? '' : '관리 화면 접근 권한 없음 — SETUP 이상 필요',
    }
  }, [login, level, perms])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
