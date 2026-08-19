import { NextResponse } from 'next/server'
import { ssoAdapter } from '@/lib/integrations/registry'
import { ACCOUNTS, SESSION_COOKIE, signSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** SSO ACS(Assertion Consumer Service) — IdP 가 SAMLResponse 를 POST 하는 인바운드 엔드포인트.
 *  어댑터가 서명·조건을 검증(실패 시 throw)하고, 어설션의 nameId 를 계정에 매핑해야 세션을 발급한다.
 *  검증 실패·미매핑·채널 미가동은 모두 세션 없이 로그인 화면으로 되돌린다(인증 우회 불가). */
export async function POST(req: Request) {
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, req.url), 303)

  const adapter = ssoAdapter()
  if (!adapter) return fail('sso-off')

  let samlResponse = ''
  let relayState = '/dashboard'
  try {
    const form = await req.formData()
    samlResponse = String(form.get('SAMLResponse') ?? '')
    const rs = String(form.get('RelayState') ?? '')
    // 오픈 리다이렉트 방지 — 로컬 경로만 허용(외부 URL·프로토콜 상대 경로 거부).
    if (rs.startsWith('/') && !rs.startsWith('//')) relayState = rs
  } catch {
    return fail('sso-badrequest')
  }
  if (!samlResponse) return fail('sso-noresponse')

  let nameId: string
  try {
    const assertion = await adapter.verifyResponse(samlResponse)
    nameId = assertion.nameId
  } catch {
    // 서명 불일치·만료·audience 불일치 등 — 검증 실패는 세션을 발급하지 않는다.
    return fail('sso-invalid')
  }

  // 어설션 신원 → 포털 계정 매핑. 미등록 사용자는 세션 없이 거부(프로비저닝은 인사연동 소관).
  const acct = ACCOUNTS.find((a) => a.login === nameId)
  if (!acct) return fail('sso-nouser')

  const res = NextResponse.redirect(new URL(relayState, req.url), 303)
  res.cookies.set(SESSION_COOKIE, signSession(acct), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.PORTAL_COOKIE_SECURE === '1',
  })
  return res
}
