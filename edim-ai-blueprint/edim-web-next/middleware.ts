/** 인증 가드 — 세션 쿠키 없으면 /login 리다이렉트 (login·정적 자원 제외). */
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from './lib/session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = Boolean(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    // 로그인 후 랜딩 = 대시보드. 종전 기본값이 /erp/eco-ledger(변경 이력 대장) 라
    // 신규 사용자의 첫 화면이 설계변경 대장이었다 — 업무 시작점이 아니다.
    if (authed) return NextResponse.redirect(new URL('/erp/dashboard', req.url))
    return NextResponse.next()
  }
  if (!authed) {
    const url = new URL('/login', req.url)
    // 루트('/')는 랜딩 재리다이렉트라 next 로 쓰면 중첩 리다이렉트 오류 → 구체 경로만 next 로.
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // API·정적·이미지 제외
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
