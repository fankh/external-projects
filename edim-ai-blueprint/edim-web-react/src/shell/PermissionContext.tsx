/** F3 — 권한 기반 UI 게이팅 (SYS-005 "권한 없는 메뉴는 미표시").
 *
 *  로그인 시 GET /auth/permissions (B21) 를 소비해 쓰기 버튼 disabled(사유 툴팁)·
 *  관리 화면 메뉴 숨김·진입 가드를 제공한다. 서버 RBAC 이 실제 게이트 —
 *  프론트 숨김은 UX 이며 보안이 아니다 (서비스 재검사 원칙 유지).
 *
 *  규칙 (백엔드 min_level 가드와 동일):
 *  - canWrite(key): SETUP 이상 = 전역 쓰기 · GENERAL 은 역할 매트릭스 WRITE 만
 *  - isAdmin: 사용자 관리 등 ADMIN 전용 작업
 *  - canReadAdmin: M-14-6 진입 (GET /users 가 SETUP 가드 — GENERAL 은 읽기도 차단)
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { sysService } from '../api/services'
import type { User } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

const LEVEL_RANK: Record<string, number> = {
  GENERAL: 0, USER: 0, SETUP: 1, ADMIN: 2, PLATFORM: 3,
}

export interface PermissionState {
  login: string
  level: string
  /** 유효 권한 매트릭스 (resource_key → READ/WRITE) — null = 백엔드 불가(mock, 레벨 폴백) */
  perms: Record<string, string> | null
  canWrite: (resourceKey?: string) => boolean
  isAdmin: boolean
  canReadAdmin: boolean
  /** 쓰기 버튼 비활성 사유 (툴팁·상태바 공용) */
  denyWrite: string
  denyAdmin: string
}

const Ctx = createContext<PermissionState | null>(null)

export function usePermission(): PermissionState {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePermission outside PermissionProvider')
  return v
}

export function PermissionProvider(props: { user: User; children: ReactNode }) {
  const { t } = useI18n()
  const [perms, setPerms] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    // 로그인 직후 1회 — 실패(mock)면 레벨 폴백
    void sysService.myPermissions().then(setPerms).catch(() => setPerms(null))
  }, [props.user.userId])

  const value = useMemo<PermissionState>(() => {
    const rank = LEVEL_RANK[props.user.userLevel] ?? 0
    return {
      login: props.user.userId,
      level: props.user.userLevel,
      perms,
      canWrite: (key?: string) =>
        rank >= LEVEL_RANK.SETUP || (!!key && perms?.[key] === 'WRITE'),
      isAdmin: rank >= LEVEL_RANK.ADMIN,
      canReadAdmin: rank >= LEVEL_RANK.SETUP,
      denyWrite: t('perm.needSetup', '권한 부족 — SETUP 이상 필요 (SYS-005)'),
      denyAdmin: t('perm.needAdmin', '권한 부족 — ADMIN 전용 (SYS-005)'),
    }
  }, [props.user.userId, props.user.userLevel, perms, t])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

/** 화면 진입 가드 패널 — 읽기 권한 자체가 없는 화면 (403 안내) */
export function AccessDenied(props: { screen: string; need: string }) {
  const { t } = useI18n()
  return (
    <div data-access-denied className="fill-col"
      style={{ alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--txt-mute)' }}>
      <div style={{ fontSize: 26 }}>🔒</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>
        {t('perm.deniedTitle', '접근 권한 없음 (403)')}
      </div>
      <div style={{ fontSize: 11 }}>
        {t('perm.deniedBody', '{s} 화면은 {n} 이상만 접근할 수 있습니다 — 관리자에게 권한을 요청하십시오 (SYS-005)')
          .replace('{s}', props.screen).replace('{n}', props.need)}
      </div>
    </div>
  )
}
