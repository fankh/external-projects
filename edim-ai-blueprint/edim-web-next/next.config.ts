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
}

export default nextConfig
