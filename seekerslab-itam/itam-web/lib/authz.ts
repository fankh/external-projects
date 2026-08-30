import { redirect } from 'next/navigation'
import { appendDenial } from './audit'
import { getSession, type Session } from './session'
import { canViewMenu } from './perm'
import type { Role } from './types'

/** 화면 단위 서버사이드 권한 게이트 — 사이드바 숨김과 별개로 직접 URL 진입을 차단한다.
 *  미로그인 → /login, 권한 밖 → /dashboard (권한·접근통제 모델 §02) */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!roles.includes(session.role)) redirect('/dashboard')
  return session
}


/** 화면 가드(매트릭스 반영) — 라우트 역할 목록과 권한 매트릭스의 '조회' 칸을 **둘 다** 만족해야 진입한다.
 *  매트릭스는 필요조건이라 켠다고 역할 규칙을 넘지 못하고, 빼면 실제로 막힌다(제품안내서 §02 의 약속).
 *  href 는 그 화면의 라우트 — lib/perm 의 ROUTE_MENU 키와 같아야 한다(매핑 없으면 역할 게이트만). */
export async function requireView(href: string, ...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  // 거부는 감사에 남긴다 — 감사 로그 화면·반출 엑셀에는 '결과=실패' 필터와 시드 「권한 밖 화면 접근 시도」가
  //  있는데, 정작 그 행을 만드는 코드가 없어 운영 중에는 실패 건이 늘지 않았다(lib/audit appendDenial).
  //  requireRole 을 거치지 않고 여기서 판정하는 이유는, 그래야 어느 화면을 두드렸는지(href)를 남길 수 있어서다.
  if (!roles.includes(session.role)) {
    appendDenial({ actor: session.name, action: '권한 밖 화면 접근 시도', target: href })
    redirect('/dashboard')
  }
  return session
}