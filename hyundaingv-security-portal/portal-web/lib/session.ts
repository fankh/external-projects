import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { Role } from './types'

export const SESSION_COOKIE = 'ngv_portal_session'

/** 세션 서명 키 — 실배포에서는 SESSION_SECRET 환경변수로 교체한다.
 *  서명이 없거나 틀린 쿠키(변조·구버전 평문)는 로그아웃으로 처리된다. */
const SECRET = process.env.SESSION_SECRET ?? 'ngv-portal-dev-secret'

function hmac(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** 로그인 시 세션을 서명해 직렬화한다: base64url(JSON) + '.' + HMAC */
export function signSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s), 'utf8').toString('base64url')
  return `${payload}.${hmac(payload)}`
}

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
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  try {
    const expected = Buffer.from(hmac(payload))
    const actual = Buffer.from(sig)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
    return s && typeof s.login === 'string' ? s : null
  } catch {
    return null
  }
}
