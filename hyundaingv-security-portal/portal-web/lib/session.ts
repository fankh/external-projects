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

/** 세션 쿠키 Secure 속성 — 프로덕션은 기본 활성(HTTPS 종단 전제), `PORTAL_COOKIE_SECURE=0` 로만 해제한다.
 *  (http 데모·게이트는 명시 해제.) 개발 모드는 기본 비활성이되 `=1` 로 활성 가능. */
export function cookieSecure(): boolean {
  return process.env.NODE_ENV === 'production'
    ? process.env.PORTAL_COOKIE_SECURE !== '0'
    : process.env.PORTAL_COOKIE_SECURE === '1'
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

/** IdP subject(NameID) → 포털 계정 매핑 규칙 파싱. `PORTAL_SSO_SUBJECT_MAP` 는 `subject=login` 쌍을
 *  콤마·개행으로 나열한다(예: `alice@narae.example=hw.kim, sso-admin=admin`). 잘못된 항목은 무시한다. */
function subjectMap(): Map<string, string> | null {
  const raw = process.env.PORTAL_SSO_SUBJECT_MAP
  if (!raw || !raw.trim()) return null
  const m = new Map<string, string>()
  for (const pair of raw.split(/[,\n]/)) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const subject = pair.slice(0, eq).trim()
    const login = pair.slice(eq + 1).trim()
    if (subject && login) m.set(subject, login)
  }
  return m.size ? m : null
}

/** SSO 어설션 신원(검증 통과한 NameID) → 포털 계정 해석. 실 배포는 IdP 의 subject 네임스페이스가 로컬
 *  로그인과 다르므로(이메일·불투명 ID 등), 문자열 일치에만 기대면 subject 충돌로 의도치 않은 계정(특히 권한
 *  계정)에 매핑될 수 있다. `PORTAL_SSO_SUBJECT_MAP` 이 설정되면 그 매핑이 유일한 근거이고 미등재 subject 는
 *  거부한다(fail-closed) — 스푸핑된 `NameID=admin` 도 매핑에 없으면 세션이 발급되지 않는다. 매핑 미설정(데모·
 *  기본)일 때만 NameID 를 로컬 로그인으로 직접 대응한다. */
export function resolveSsoAccount(nameId: string): Session | null {
  // 매핑 '변수가 설정됨' 자체가 운영자의 신원 제한 의도다 → 설정됐으면 매핑이 유일 근거(fail-closed).
  // 파싱 결과가 비어도(오설정: 형식 오류로 유효 쌍 0개) NameID 직접대응으로 폴백하지 않는다 — 폴백하면
  // 오설정이 '더 느슨한' 직접매칭으로 새어 스푸핑된 NameID(admin 등)를 허용하는 fail-open 이 된다.
  if ((process.env.PORTAL_SSO_SUBJECT_MAP ?? '').trim()) {
    const login = subjectMap()?.get(nameId)
    if (!login) return null
    return ACCOUNTS.find((a) => a.login === login) ?? null
  }
  // 매핑 미설정 → NameID 를 로컬 로그인으로 직접 대응(데모·동일 네임스페이스 배포)
  return ACCOUNTS.find((a) => a.login === nameId) ?? null
}

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
