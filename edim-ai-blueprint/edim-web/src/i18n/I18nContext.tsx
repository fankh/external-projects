/** i18n 런타임 (REQ-N-015) — locale ko/en/ja/zh, KO 폴백 (개발표준 §4).
 *  번들: GET /api/v1/i18n/{locale} (sys_translation) — 불가 시 내장 사전 폴백. */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { OFFLINE_BUNDLES } from './bundles'

export type Locale = 'ko' | 'en' | 'ja' | 'zh'
export const LOCALES: Locale[] = ['ko', 'en', 'ja', 'zh']

const LOCALE_KEY = 'edim-locale'

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
  /** t(key, koDefault) — 번들 미존재 키는 KO 폴백 */
  t: (key: string, ko: string) => string
}

const Ctx = createContext<I18nState | null>(null)

export function useI18n(): I18nState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}

async function fetchBundle(locale: Locale): Promise<Record<string, string>> {
  if (locale === 'ko') return {}
  try {
    const res = await fetch(`/api/v1/i18n/${locale}`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) return await res.json() as Record<string, string>
  } catch { /* 오프라인 — 내장 사전 */ }
  return OFFLINE_BUNDLES[locale] ?? {}
}

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY)
    return (LOCALES as string[]).includes(saved ?? '') ? saved as Locale : 'ko'
  })
  const [bundle, setBundle] = useState<Record<string, string>>({})

  useEffect(() => {
    void fetchBundle(locale).then(setBundle)
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(LOCALE_KEY, l)
  }, [])

  const t = useCallback(
    (key: string, ko: string) => (locale === 'ko' ? ko : (bundle[key] ?? ko)),
    [locale, bundle])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

/** 타이틀바용 dense 로케일 스위처 */
export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n()
  return (
    <select aria-label="locale" value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      style={{
        background: '#1E3560', color: '#B9C7E2', border: '1px solid #3A5488',
        borderRadius: 2, fontSize: 10.5, height: 18, padding: '0 2px',
      }}>
      {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
    </select>
  )
}
