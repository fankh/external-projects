import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EDIM — NOVA Solution',
  description: 'AI 기반 2D 도면 · CTO/ETO ERP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
