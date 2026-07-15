import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // P6 — 배포: 최소 런타임 번들(.next/standalone) 로 Docker 이미지 경량화.
  output: 'standalone',
  // 이관 기간 프록시(선택): 미이관 API 는 백엔드로 rewrite. 서버 fetch 는 lib/api 가 직접 호출.
  async rewrites() {
    const base = process.env.EDIM_API_BASE
    return base
      ? [{ source: '/api/v1/:path*', destination: `${base}/:path*` }]
      : []
  },
  // 모듈 루트 URL — 레거시 SPA 는 /plm /cpq 등 모듈 경로가 유효했음. 대표 화면으로 안내 (404 방지).
  async redirects() {
    return [
      { source: '/erp', destination: '/erp/dashboard', permanent: false },
      { source: '/cpq', destination: '/cpq/selection', permanent: false },
      { source: '/plm', destination: '/plm/parts', permanent: false },
      { source: '/code', destination: '/code/subcode', permanent: false },
      { source: '/toolbox', destination: '/toolbox/macros', permanent: false },
      { source: '/common', destination: '/common/approval', permanent: false },
      { source: '/detail', destination: '/detail/code', permanent: false },
    ]
  },
}

export default nextConfig
