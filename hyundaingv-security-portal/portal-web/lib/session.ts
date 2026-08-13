import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { Role } from './types'

export const SESSION_COOKIE = 'ngv_portal_session'

/** 세션 서명 키 — 실배포에서는 SESSION_SECRET 환경변수로 교체한다.
 *  서명이 없거나 틀린 쿠키(변조·구버전 평문)는 로그아웃으로 처리된다. */
const DEV_SECRET = 'ngv-portal-dev-secret'
// 미설정뿐 아니라 빈 문자열·공백도 안전하지 않다 — '' 는 ?? 를 통과해 빈 서명 키가 되므로
// 명시적으로 개발용 기본값으로 폴백시킨다.
const RAW = process.env.SESSION_SECRET
const SECRET = RAW && RAW.trim() ? RAW : DEV_SECRET

/** 세션 서명 키가 안전하지 않은가(미설정·빈값·공개된 개발용 기본값) — 기동 훅이 프로덕션 경고에 쓴다.
 *  이 상태면 소스에 키가 있거나 빈 키이므로 누구나 관리자 세션을 위조할 수 있다. */
export const SESSION_SECRET_IS_DEFAULT = SECRET === DEV_SECRET

function hmac(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** 세션 유효기간 — 탈취된 쿠키가 무기한 유효하지 않도록 만료를 서명에 포함한다 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** 로그인 시 세션을 서명해 직렬화한다: base64url(JSON + exp) + '.' + HMAC */
export function signSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + SESSION_TTL_MS }), 'utf8').toString('base64url')
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
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session & { exp?: number }
    if (!parsed || typeof parsed.login !== 'string') return null
    // 만료 검증 — exp 가 없거나 지난 세션은 무효 (재로그인 유도)
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null
    const { exp: _exp, ...s } = parsed
    return s
  } catch {
    return null
  }
}
