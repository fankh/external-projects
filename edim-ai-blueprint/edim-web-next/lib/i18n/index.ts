/** i18n — 빌드타임 baked 번들(SPA 와 동일 원천). 서버에서 locale 쿠키로 SSR, 무플래시. */
import { OFFLINE_BUNDLES } from './bundles'

export type Locale = 'ko' | 'en' | 'ja' | 'zh'

export function bundleFor(locale: Locale): Record<string, string> {
  return locale === 'ko' ? {} : (OFFLINE_BUNDLES[locale] ?? {})
}

/** t(bundle, key, koFallback) — 순수 함수(서버/클라 공용) */
export function translate(bundle: Record<string, string>, key: string, ko: string): string {
  return bundle[key] ?? ko
}
