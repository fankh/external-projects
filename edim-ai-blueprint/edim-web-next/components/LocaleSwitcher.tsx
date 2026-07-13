'use client'

/** 로케일 스위처 — 쿠키(edim_locale) 설정 후 router.refresh() → 서버 재렌더(SSR 로케일 반영). */
import { useRouter } from 'next/navigation'
import { useI18n, type Locale } from './I18nProvider'

const LOCALES: Locale[] = ['ko', 'en', 'ja', 'zh']

export function LocaleSwitcher() {
  const { locale } = useI18n()
  const router = useRouter()
  return (
    <select aria-label="locale" value={locale}
      onChange={(e) => {
        document.cookie = `edim_locale=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        router.refresh()
      }}
      style={{ background: '#1E3560', color: '#B9C7E2', border: '1px solid #3A5488', borderRadius: 2, fontSize: 10.5, height: 18, padding: '0 2px' }}>
      {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
    </select>
  )
}
