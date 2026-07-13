/** 클라이언트 UI 프리퍼런스 — 그리드 컬럼 폭/순서/표시 등 브라우저 로컬 저장.
 *  (SPA 는 백엔드 /prefs 사용. Next 이관 단계에선 per-browser localStorage 로 단순화;
 *   P5 에서 서버 동기화로 승격 예정.) SSR 안전(window 가드). */
const KEY = (k: string) => `edim.pref.${k}`

export const prefService = {
  async get<T = unknown>(key: string): Promise<T | null> {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(KEY(key))
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  },
  async set(key: string, value: unknown): Promise<boolean> {
    if (typeof window === 'undefined') return false
    try {
      localStorage.setItem(KEY(key), JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
}
