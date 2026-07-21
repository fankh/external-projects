'use client'

/** UI 프리퍼런스 — 서버(/prefs) 동기화 + localStorage 캐시(오프라인/즉시성).
 *  P5: SPA 와 동일하게 서버 영속. get=서버 우선(불가 시 로컬 캐시), set=write-through(로컬 즉시+서버 배경).
 *
 *  7.2 — **미확정 로컬 쓰기 보호**: 종전에는 set() 이 서버 쓰기를 배경으로 두고 곧바로 반환했고,
 *  get() 은 무조건 서버를 우선했다. 그래서 값을 바꾼 직후 새로고침하면 서버 왕복이 끝나기 전에
 *  옛 서버 값이 로컬을 덮어써 **변경이 조용히 사라졌다**(그리드 열 너비에서 실제로 재현).
 *  이제 로컬에 '언제 썼는지 / 서버까지 확정됐는지'를 함께 남기고, 미확정 로컬이 있으면
 *  get() 이 그것을 우선하며 서버로 다시 밀어 넣는다.
 */
import { getPref, setPref } from './prefActions'

const KEY = (k: string) => `edim.pref.${k}`

interface Envelope<T> { v: T; t: number; synced: boolean }

function isEnvelope(x: unknown): x is Envelope<unknown> {
  return Boolean(x) && typeof x === 'object' && x !== null
    && 't' in (x as Record<string, unknown>) && 'v' in (x as Record<string, unknown>)
}

function readEnvelope<T>(key: string): Envelope<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    // 구버전 캐시(값만 저장)도 그대로 읽는다 — 동기화된 것으로 간주
    return isEnvelope(parsed) ? (parsed as Envelope<T>) : { v: parsed as T, t: 0, synced: true }
  } catch { return null }
}

function writeEnvelope(key: string, value: unknown, synced: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY(key), JSON.stringify({ v: value, t: Date.now(), synced }))
  } catch { /* quota */ }
}

export const prefService = {
  /** 서버 값 우선 — 단, **서버까지 확정되지 않은 로컬 변경이 있으면 그쪽이 최신**이므로 우선한다. */
  async get<T = unknown>(key: string): Promise<T | null> {
    const local = readEnvelope<T>(key)
    if (local && !local.synced) {
      // 아직 서버에 확정되지 않은 내 변경 — 서버 값으로 덮지 않고, 다시 밀어 넣는다
      void setPref(key, local.v).then((okFlag) => {
        if (okFlag) writeEnvelope(key, local.v, true)
      }).catch(() => { /* 다음 기회에 재시도 */ })
      return local.v
    }
    try {
      const server = await getPref<T>(key)
      if (server !== null) { writeEnvelope(key, server, true); return server }
    } catch { /* 서버 불가 — 로컬로 */ }
    return local ? local.v : null
  },
  /** write-through — 로컬 즉시 반영(미확정) 후 서버 영속, 성공 시 확정 표시. */
  async set(key: string, value: unknown): Promise<boolean> {
    writeEnvelope(key, value, false)
    try {
      const okFlag = await setPref(key, value)
      if (okFlag) writeEnvelope(key, value, true)
      return okFlag
    } catch { return false }
  },
}
