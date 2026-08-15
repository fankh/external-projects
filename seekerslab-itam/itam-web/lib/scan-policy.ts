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
