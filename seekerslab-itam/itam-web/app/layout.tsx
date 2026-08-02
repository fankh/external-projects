import type { Metadata } from 'next'
import { ChunkReload } from './ChunkReload'
import './globals.css'

export const metadata: Metadata = {
  title: 'SEEKERSLAB ITAM — AI 기반 IT 자산관리',
  description: '자산 수명주기 관리 · Shadow IT Discovery · AI 자산 인텔리전스 통합 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ChunkReload />
        {children}
      </body>
    </html>
  )
}
