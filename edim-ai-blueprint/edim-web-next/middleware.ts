/** 인증 가드 — 세션 쿠키 없으면 /login 리다이렉트 (login·정적 자원 제외). */
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from './lib/session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = Boolean(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    if (authed) return NextResponse.redirect(new URL('/erp/eco-ledger', req.url))
    return NextResponse.next()
  }
  if (!authed) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // API·정적·이미지 제외
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
