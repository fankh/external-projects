import { cookies } from 'next/headers'
import type { Role } from './types'

export const SESSION_COOKIE = 'ngv_portal_session'

export interface Session {
  login: string
  name: string
  dept: string
  role: Role
}

/** SSO(SAML) 목업 — 데모 계정. 실제 배포에서는 IdP 어설션으로 대체. */
export const ACCOUNTS: Session[] = [
  { login: 'hw.kim', name: '김현우', dept: '개발1팀', role: 'USER' },
  { login: 'sj.lee', name: '이수진', dept: '경영지원팀', role: 'DEPT_MGR' },
  { login: 'jh.park', name: '박정호', dept: 'IT운영팀', role: 'BIZ_MGR' },
  { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' },
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
