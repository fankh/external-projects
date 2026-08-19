import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { ChunkReload } from './ChunkReload'
import './globals.css'

/** Pretendard Variable 자체 호스팅 — 클라이언트 폰트 설치 여부와 무관하게 동일한 타이포를 보장한다.
 *  (미설치 시 Malgun Gothic 폴백으로 렌더 편차가 생기던 문제 해소). CSS 변수로 노출해 globals.css 가 사용. */
const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'swap',
  variable: '--font-pretendard',
  fallback: ['Malgun Gothic', 'Segoe UI', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: '전사 IT·보안 거버넌스 포털',
  description: 'IT 투자/비용 · 인프라 운영 · 프로젝트 · 보안 컴플라이언스 통합 포털',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <ChunkReload />
        {children}
      </body>
    </html>
  )
}
