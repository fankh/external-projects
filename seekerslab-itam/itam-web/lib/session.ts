import { cookies } from 'next/headers'
import { getStore } from './store'
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
    if (!s || typeof s.login !== 'string') return null
    // 권한그룹의 단일 출처는 스토어다 — 쿠키에 박힌 역할을 그대로 믿으면 관리자가 권한그룹을 바꿔도
    //  이미 로그인해 있는 사람은 다음 로그인까지 예전 권한으로 계속 움직인다(회수했는데 회수되지 않는다).
    //  사용자·그룹 화면은 '변경 즉시 반영'을 전제로 감사 로그까지 남기므로, 조회 시점에 스토어 값으로 맞춘다.
    //  이름·부서는 쿠키 값을 유지한다(소유자 판정 등 표시·범위용이고, 역할만이 권한 판정의 근거다).
    const user = getStore().users.find((u) => u.login === s.login)
    return user ? { ...s, role: user.role } : s
  } catch {
    return null
  }
}
