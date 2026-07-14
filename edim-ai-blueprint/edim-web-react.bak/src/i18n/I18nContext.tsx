/** i18n 런타임 (REQ-N-015) — locale ko/en/ja/zh, KO 폴백 (개발표준 §4).
 *  번들: GET /api/v1/i18n/{locale} (sys_translation) — 불가 시 내장 사전 폴백. */
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
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

const offlineOf = (l: Locale): Record<string, string> => (l === 'ko' ? {} : (OFFLINE_BUNDLES[l] ?? {}))

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY)
    return (LOCALES as string[]).includes(saved ?? '') ? saved as Locale : 'ko'
  })
  // 번들은 빌드타임 baked(OFFLINE_BUNDLES)에서 동기 파생 — 런타임 fetch/재설정 없음.
  // 로드 후 i18n 상태 변경 0 (SSR 등가·무플래시). 로케일 전환 시 useMemo 즉시 재산출.
  // (UI 번역은 seed→bundles 단일원천이며 빌드마다 재생성되므로 DB fetch 는 불필요)
  const bundle = useMemo(() => offlineOf(locale), [locale])

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
