'use client'

/** 클라이언트 i18n — 서버(app 레이아웃)에서 locale+bundle 주입 → 클라이언트 아일랜드 t() 공용.
 *  bundle 은 빌드타임 baked(직렬화된 평문 객체)라 하이드레이션 불일치 없음. */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'

export type Locale = 'ko' | 'en' | 'ja' | 'zh'

interface I18nState {
  locale: Locale
  t: (key: string, ko: string) => string
}

const Ctx = createContext<I18nState | null>(null)

export function useI18n(): I18nState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}

export function I18nProvider(props: { locale: Locale; bundle: Record<string, string>; children: ReactNode }) {
  const { locale, bundle } = props
  const t = useCallback((key: string, ko: string) => (locale === 'ko' ? ko : (bundle[key] ?? ko)), [locale, bundle])
  const value = useMemo(() => ({ locale, t }), [locale, t])
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
