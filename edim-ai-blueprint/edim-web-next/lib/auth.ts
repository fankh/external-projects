/** 서버 전용 인증/권한 로드 — SSR 레이아웃에서 me + permissions 를 읽어 게이팅 시드. */
import 'server-only'
import { apiServer } from './api'

export interface Me { login: string; name: string; userLevel: string; roles: string[] }

export const LEVEL_RANK: Record<string, number> = { GENERAL: 0, USER: 0, SETUP: 1, ADMIN: 2, PLATFORM: 3 }

/** GET /auth/me — 실패(비로그인/백엔드 불가) 시 null. */
export async function getMe(): Promise<Me | null> {
  try {
    return await apiServer<Me>('/auth/me')
  } catch {
    return null
  }
}

/** GET /auth/permissions — resource_key → READ/WRITE 매트릭스. 실패 시 null(레벨 폴백). */
export async function getPermissions(): Promise<Record<string, string> | null> {
  try {
    return await apiServer<Record<string, string>>('/auth/permissions')
  } catch {
    return null
  }
}

/** 진입 최소 등급 충족 여부 (서버측 페이지 가드용). me 불가 시 GENERAL 로 간주. */
export async function hasLevel(minLevel: string): Promise<boolean> {
  const me = await getMe()
  const rank = LEVEL_RANK[me?.userLevel ?? 'GENERAL'] ?? 0
  return rank >= (LEVEL_RANK[minLevel] ?? 0)
}
