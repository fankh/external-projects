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
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ]
  },
}

export default nextConfig
