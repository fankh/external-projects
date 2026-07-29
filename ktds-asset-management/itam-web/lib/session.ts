import { cookies } from 'next/headers'
import type { Role } from './types'

export const SESSION_COOKIE = 'itam_session'

export interface Session {
  login: string
  name: string
  dept: string
  role: Role
}

/** SSO(SAML) 목업 — 데모 계정. 실제 배포에서는 IdP 어설션으로 대체. */
export const ACCOUNTS: Session[] = [
  { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER' },
  { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' },
  { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' },
  { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' },
]

export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    return s && typeof s.login === 'string' ? s : null
  } catch {
    return null
  }
}
