import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '전사 IT·보안 거버넌스 포털',
  description: 'IT 투자/비용 · 인프라 운영 · 프로젝트 · 보안 컴플라이언스 통합 포털',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
