import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** 콘텐츠 보안 정책(CSP) — 요청마다 nonce 를 만들어 그 nonce 를 가진 스크립트만 실행시킨다.
 *
 *  X-Frame-Options·nosniff·Referrer-Policy 는 next.config 의 정적 헤더로 이미 붙는다. 그것들은
 *  "남이 이 앱을 어떻게 쓰는가"를 막고, CSP 는 "이 앱 안에서 무엇이 실행되는가"를 막는다 —
 *  모델명·비고·사유가 인쇄 문서 HTML 에 그대로 실리는 앱이라 후자가 마지막 방어선이다.
 *  이스케이프가 한 곳이라도 새면 CSP 가 그 스크립트의 실행을 막는다(방어 심층화).
 *
 *  nonce 를 쓰는 이유 — Next 는 하이드레이션 부트스트랩을 인라인 <script> 로 넣는다. 그래서
 *  script-src 에 'unsafe-inline' 을 주지 않으려면 nonce 밖에 답이 없다. Next 는 요청 헤더의
 *  Content-Security-Policy 에서 nonce 를 읽어 자기 인라인 스크립트에 자동으로 붙인다.
 *  'strict-dynamic' 은 그 nonce 스크립트가 불러오는 청크까지 신뢰를 전파한다.
 *
 *  style-src 에 'unsafe-inline' 이 남는 이유 — 이 앱은 style={{...}} 인라인 스타일을 광범위하게
 *  쓴다(요소의 style 속성). 이건 style-src-attr 이 통제하는데, nonce 를 붙일 자리가 없다.
 *  스타일 주입은 스크립트 실행이 아니라 표시 왜곡이라 위험 등급이 다르므로 여기서 끊는다. */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",       // QR·바코드는 인라인 SVG, 라벨 미리보기는 data: URI
    "font-src 'self'",
    "connect-src 'self'",         // 서버 액션·RSC 요청은 같은 출처뿐
    "object-src 'none'",
    "base-uri 'self'",            // <base> 주입으로 상대 경로를 남의 출처로 돌리는 것을 막는다
    "form-action 'self'",         // 로그인·결재 폼이 외부로 제출되지 않게
    "frame-ancestors 'none'",     // X-Frame-Options: DENY 의 CSP 판(최신 브라우저는 이쪽을 본다)
    "frame-src 'none'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  // Next 가 이 헤더를 읽어 자기 인라인 스크립트에 nonce 를 붙인다 — 응답 헤더만 세우면 붙지 않는다.
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)

  // HSTS — https 로 들어온 요청에만 붙인다. 세션 쿠키의 secure 와 짝이다: secure 는 "쿠키를 평문으로
  //  보내지 마라"이고, HSTS 는 "이 출처에는 애초에 평문으로 붙지 마라"다. 둘이 있어야 첫 요청이
  //  http:// 로 시작해 리다이렉트되는 그 한 번의 왕복까지 없어진다.
  //  평문 배포(README 기본 절차의 3390)에 붙이면 브라우저가 그 호스트를 https 전용으로 기억해
  //  버려 평문으로는 다시 접속할 수 없다 — 되돌리려면 사용자가 브라우저 설정을 뒤져야 한다.
  //  그래서 프로토콜을 보고 조건부로만 붙인다(secure 쿠키와 같은 판단 근거).
  //  preload 는 넣지 않는다 — 브라우저 목록에 등재되면 되돌리기가 매우 어렵고, 그건 운영자가
  //  도메인 전체를 놓고 결정할 일이지 앱이 대신 정할 일이 아니다.
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  if (proto === 'https') response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  return response
}

export const config = {
  matcher: [
    /* 정적 자산(_next/static)·이미지 최적화·favicon 은 제외한다 — 스크립트를 실행하지 않는 바이트이고,
       매 요청마다 nonce 를 만들면 그만큼 캐시가 무의미해진다. prefetch(RSC) 요청도 같은 문서 정책을
       받아야 하므로 제외하지 않는다. */
    { source: '/((?!_next/static|_next/image|favicon.ico).*)' },
  ],
}
