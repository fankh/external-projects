import type { ChannelObservation, ScanPolicy } from './types'

/** 재탐지 주기 → 밀리초. 활성 채널인데 주기를 넘기도록 수집이 없으면 정체된 수집기(Discovery 사각).
 *  실시간은 명시 주기가 없으므로 짧은 유예(1시간)로 본다. SCAN_INTERVALS(화면 프리셋)와 키가 일치한다. */
const INTERVAL_MS: Record<string, number> = {
  '실시간': 3_600_000, '1분': 60_000, '5분': 300_000, '15분': 900_000, '30분': 1_800_000,
  '1시간': 3_600_000, '6시간': 21_600_000, '12시간': 43_200_000, '매일': 86_400_000, '주 1회': 604_800_000,
}

/** 채널별 마지막 수집(관측) 시각 — 관측 저장소가 원천. 스캔 화면의 '마지막 수집'과 동일 산출. */
export function lastCollectionByChannel(observations: ChannelObservation[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const o of observations) {
    const cur = m.get(o.channel)
    if (!cur || o.seenAt > cur) m.set(o.channel, o.seenAt)
  }
  return m
}

/** 재탐지 주기 경과 — 활성 채널인데 마지막 수집이 주기를 넘겼다(정체된 수집기 = Discovery 사각). EASM 재탐지 지연(isEasmRescanOverdue)과 동형.
 *  now 는 서버가 주입(하이드레이션 안전). 관측이 없는 채널(lastSeen 없음)·중지 채널·미정의 주기는 판정 제외. */
export function isScanOverdue(policy: Pick<ScanPolicy, 'enabled' | 'interval'>, lastSeen: string | undefined, now: string): boolean {
  if (!policy.enabled || !lastSeen) return false
  const ms = INTERVAL_MS[policy.interval]
  if (!ms) return false
  return Date.parse(now) - Date.parse(lastSeen) > ms
}

/** 재탐지 지연 채널 목록 — 스캔 화면 칩·대시보드 큐가 같은 판정을 공유(단일 소스). */
export function overdueScanChannels(policies: ScanPolicy[], observations: ChannelObservation[], now: string): string[] {
  const last = lastCollectionByChannel(observations)
  return policies.filter((p) => isScanOverdue(p, last.get(p.channel), now)).map((p) => p.channel)
}

/** 수집 시간대 문자열('HH:MM ~ HH:MM' · '상시') 파싱 — 분 단위 경계로 환산한다.
 *  시는 1~2자리를 허용하되(정책 편집기가 '9:00' 을 넘길 수 있다) 시 00~23·분 00~59 범위를 벗어나면 null.
 *  범위를 안 보면 '99:99 ~ 88:77' 이 현재 시각(최대 1439분)보다 큰 경계로 환산돼 자정 넘김 창으로 해석되고
 *  판정이 항상 참이 된다 — §07 시간대 안전장치가 조용히 꺼진다. '상시'는 창이 아니므로 여기서 다루지 않는다. */
export function parseScanWindow(window: string): { from: number; to: number } | null {
  const m = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/.exec(window.trim())
  if (!m) return null
  const [h1, min1, h2, min2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (h1 > 23 || h2 > 23 || min1 > 59 || min2 > 59) return null
  return { from: h1 * 60 + min1, to: h2 * 60 + min2 }
}

/** 수집 시간대 입력 검증 — 통과면 null, 아니면 사용자 안내 문구. 형식 오류와 범위 오류를 구분해 돌려준다. */
export function scanWindowError(window: string): string | null {
  const w = window.trim()
  if (w === '상시') return null
  if (!/^\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}$/.test(w)) return "수집 시간대는 'HH:MM ~ HH:MM' 또는 '상시'로 입력하세요."
  if (!parseScanWindow(w)) return '수집 시간대의 시는 00~23, 분은 00~59 범위로 입력하세요.'
  return null
}

/** 저장용 정규화 — 한 자리 시를 두 자리로 맞춘다('9:00 ~ 18:00' → '09:00 ~ 18:00').
 *  판정은 1~2자리를 모두 읽지만, 저장 값이 들쭉날쭉하면 화면·감사 로그의 시간대 표기가 갈린다. */
export function normalizeScanWindow(window: string): string {
  const w = window.trim()
  if (w === '상시') return w
  const m = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/.exec(w)
  if (!m) return w
  return `${m[1].padStart(2, '0')}:${m[2]} ~ ${m[3].padStart(2, '0')}:${m[4]}`
}

/** 지금(hhmm, 'HH:MM')이 정책 수집 시간대 안인가 — 능동 스캔의 §07 시간대 안전장치 판정.
 *  읽을 수 없는 창은 '창 밖'으로 본다(fail closed). 예전엔 파싱 실패 시 참을 돌려줘, 스냅샷·구버전 데이터의
 *  깨진 시간대가 그대로 안전장치를 껐다 — 사유 없이 창 밖 능동 스캔이 통과하고 강도 '높음' 차단도 풀렸다.
 *  창 밖이어도 사유를 입력하면 실행할 수 있으므로(강도 '높음'만 차단) 닫는 쪽이 안전하고 막다른 길도 아니다. */
export function inScanWindow(window: string, hhmm: string): boolean {
  if (window.trim() === '상시') return true
  const w = parseScanWindow(window)
  if (!w) return false
  const cur = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  if (!Number.isFinite(cur)) return false
  // 23:00~05:00 처럼 자정을 넘는 창
  return w.from <= w.to ? cur >= w.from && cur <= w.to : cur >= w.from || cur <= w.to
}
