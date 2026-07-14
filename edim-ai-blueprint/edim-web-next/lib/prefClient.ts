'use client'

/** UI 프리퍼런스 — 서버(/prefs) 동기화 + localStorage 캐시(오프라인/즉시성).
 *  P5: SPA 와 동일하게 서버 영속. get=서버 우선(불가 시 로컬 캐시), set=write-through(로컬 즉시+서버 배경). */
import { getPref, setPref } from './prefActions'

const KEY = (k: string) => `edim.pref.${k}`

function readLocal<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try { const raw = localStorage.getItem(KEY(key)); return raw ? (JSON.parse(raw) as T) : null } catch { return null }
}
function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY(key), JSON.stringify(value)) } catch { /* quota */ }
}

export const prefService = {
  /** 서버 값 우선 — 성공 시 로컬 캐시 갱신, 실패 시 로컬 폴백. */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const server = await getPref<T>(key)
      if (server !== null) { writeLocal(key, server); return server }
    } catch { /* 서버 불가 — 로컬로 */ }
    return readLocal<T>(key)
  },
  /** write-through — 로컬 즉시 반영 후 서버 영속(배경). */
  async set(key: string, value: unknown): Promise<boolean> {
    writeLocal(key, value)
    try { return await setPref(key, value) } catch { return false }
  },
}
