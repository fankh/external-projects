import type { Metadata } from 'next'
import './globals.css'
import { ChunkReloadGuard } from '@/components/ChunkReloadGuard'
import { getLocale } from '@/lib/session'

export const metadata: Metadata = {
  title: 'EDIM — NOVA Solution',
  description: 'AI 기반 2D 도면 · CTO/ETO ERP',
}

// 9.12 — html lang 을 실제 로케일로. 종전 하드코딩 'ko' 는 en/ja/zh 사용자에게도 한국어를
// 선언해 스크린리더 발음·브라우저 번역 제안·하이픈네이션을 오도했다(a11y/i18n 결함).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale}>
      <body>
        <ChunkReloadGuard />
        {children}
      </body>
    </html>
  )
}
