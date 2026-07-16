import type { Metadata } from 'next'
import './globals.css'
import { ChunkReloadGuard } from '@/components/ChunkReloadGuard'

export const metadata: Metadata = {
  title: 'EDIM — NOVA Solution',
  description: 'AI 기반 2D 도면 · CTO/ETO ERP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ChunkReloadGuard />
        {children}
      </body>
    </html>
  )
}
