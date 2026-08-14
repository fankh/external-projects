// CSP — 외부 출처 로드·삽입을 봉쇄한다. Next 하이드레이션이 인라인 스크립트를 쓰므로
// script/style 은 'unsafe-inline' 을 허용하고(논스 도입은 SAML 전환 시점에 미들웨어와 함께),
// dev 서버(HMR)만 'unsafe-eval' 이 추가로 필요하다.
const dev = process.env.NODE_ENV === 'development'
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 클릭재킹·MIME 스니핑·레퍼러 유출·외부 출처 삽입 방어 (보안성 검토 기본 항목)
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // HTTPS 강제 — 세션 쿠키가 평문(http)으로 새지 않도록 브라우저가 이후 요청을 https 로 승격한다.
          // (http 응답에 실린 HSTS 는 브라우저가 무시하므로 http 데모·게이트에는 영향 없음, HTTPS 배포만 강화)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: CSP },
          // 포털이 쓰지 않는 브라우저 기능은 명시적으로 봉쇄한다
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
