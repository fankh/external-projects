import { NextResponse } from 'next/server'
import { ssoAdapter } from '@/lib/integrations/registry'

export const dynamic = 'force-dynamic'

/** SSO 로그인 시작 (SP-initiated) — SSO 채널이 가동 중이면 IdP 로그인 URL 로 리다이렉트한다.
 *  채널 미가동(데모 기본 목업 등)이면 계정 선택 로그인 화면으로 보낸다. */
export async function GET(req: Request) {
  const adapter = ssoAdapter()
  if (!adapter) return NextResponse.redirect(new URL('/login', req.url))
  const relayState = new URL(req.url).searchParams.get('relayState') ?? '/dashboard'
  try {
    const { url } = adapter.loginRedirect(relayState)
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.redirect(new URL('/login?error=sso', req.url))
  }
}
