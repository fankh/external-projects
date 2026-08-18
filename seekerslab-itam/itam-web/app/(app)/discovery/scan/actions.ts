'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { Channel, ScanPolicy, ScanRun } from '@/lib/types'
import { fingerprintOf } from '@/lib/types'

/** 능동 스캔은 운영망에 부하를 주므로 정책 창 안에서만 자유롭게 돈다.
 *  창 밖 실행은 사유를 남겨야 하고, 강도 '높음'은 창 밖에서 아예 막는다.
 *  (제품안내서 §04 비고 '스캔 정책·시간대 협의' · §07 스캔 안전장치) */
function inWindow(window: string, hhmm: string): boolean {
  if (window === '상시') return true
  // 시(hour)는 1~2자리 모두 허용한다 — 정책 편집기가 '9:00' 같은 한 자리 시를 저장할 수 있어, 2자리만 파싱하면
  // 창을 못 읽고 아래 return true 로 빠져 §07 시간대 밖 안전장치가 조용히 꺼진다(창 밖 능동 스캔이 사유 없이 통과).
  const m = window.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/)
  if (!m) return true
  const cur = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const from = Number(m[1]) * 60 + Number(m[2])
  const to = Number(m[3]) * 60 + Number(m[4])
  // 23:00~05:00 처럼 자정을 넘는 창
  return from <= to ? cur >= from && cur <= to : cur >= from || cur <= to
}

export interface ScanInput {
  channels: Channel[]
  scope: string
  intensity: ScanPolicy['intensity']
  override?: string
}

/** 스캔 재실행 — 과거 회차(scanRuns)의 채널·범위·강도를 그대로 다시 돌린다. 스캔 이력에서 원클릭 재탐지 —
 *  그동안 이력은 조회 전용이라, 같은 조건으로 다시 돌리려면 콘솔에서 채널·강도를 수기로 다시 골라야 했다.
 *  runScan 에 위임하므로 정책 중지 채널·시간대 안전장치·감사 기록을 똑같이 탄다(시간대 밖이면 재실행 사유가 기록된다). */
export async function rerunScan(runId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '스캔 실행 권한이 없습니다.' }
  const prev = getStore().scanRuns.find((r) => r.id === runId)
  if (!prev) return { ok: false, message: '재실행할 스캔 회차를 찾을 수 없습니다.' }
  return runScan({
    channels: prev.channels,
    scope: prev.scope,
    intensity: prev.intensity,
    override: prev.override || `이전 회차(${prev.id}) 재실행`,
  })
}

/** 스캔 실행 — 선택한 채널이 관측을 수집하고, 지문으로 병합되어 발견 저장소에 반영된다. */
export async function runScan(input: ScanInput) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '스캔 실행 권한이 없습니다.' }

  const s = getStore()
  if (input.channels.length === 0) return { ok: false, message: '수집 채널을 하나 이상 선택해 주세요.' }

  const policies = new Map(s.scanPolicies.map((p) => [p.channel, p]))
  const disabled = input.channels.filter((c) => !policies.get(c)?.enabled)
  if (disabled.length > 0) {
    return { ok: false, message: `정책에서 중지된 채널입니다 — ${disabled.join(', ')} (탐지 채널·정책에서 재개)` }
  }

  const clock = nowMinute().slice(11, 16)
  const outOfWindow = input.channels.filter((c) => {
    const p = policies.get(c)
    return p && p.kind === '능동' && !inWindow(p.window, clock)
  })
  if (outOfWindow.length > 0) {
    if (input.intensity === '높음') {
      return { ok: false, message: `정책 시간대(${policies.get(outOfWindow[0])!.window}) 밖에서는 강도 '높음' 능동 스캔을 실행할 수 없습니다.` }
    }
    if (!input.override?.trim()) {
      return {
        ok: false,
        needOverride: true,
        message: `${outOfWindow.join(', ')} 은(는) 정책 시간대 ${policies.get(outOfWindow[0])!.window} 밖입니다 (현재 ${clock}). 실행 사유를 입력하면 진행합니다.`,
      }
    }
  }

  const at = nowMinute()
  const run: ScanRun = {
    id: nextId(`SCN-RUN-${today().slice(2, 4)}${today().slice(5, 7)}`),
    startedAt: at,
    channels: input.channels,
    scope: input.scope,
    intensity: input.intensity,
    status: '실행 중',
    observed: 0,
    reobserved: 0,
    newFound: 0,
    by: session.name,
    override: outOfWindow.length > 0 ? input.override?.trim() : undefined,
  }

  // ── 재관측 — 이미 아는 장비를 다시 본다. 지문이 같으므로 관측만 늘고 발견 건수는 그대로.
  //    한 장비를 여러 채널이 볼 수 있으므로 채널마다 관측을 남긴다. 대표 채널 하나에만
  //    기록하면 '채널별 수집 현황'의 마지막 수집 시각이 실제와 어긋난다.
  for (const d of s.discovered) {
    const seenBy = new Set<Channel>([d.channel, ...s.observations.filter((o) => o.discoveredId === d.id).map((o) => o.channel)])
    const hits = input.channels.filter((c) => seenBy.has(c))
    if (hits.length === 0) continue
    for (const hit of hits) {
      s.observations.unshift({
        id: nextId('OBS'),
        discoveredId: d.id,
        channel: hit,
        hostname: d.hostname,
        ip: d.ip,
        mac: d.mac,
        seenAt: at,
        detail: `${run.id} 재관측 — 생존 확인 (강도 ${input.intensity})`,
      })
      run.observed += 1
      run.reobserved += 1
    }
    d.lastSeen = today()
    // 미확인(유령)이던 자산이 다시 잡히면 상태를 되돌린다 — 생존 신호
    if (d.state === '미확인') {
      // 매칭 자산이 있으면 등록으로 되돌리되, 미해소 불일치(mismatch)가 남아 있으면 '등록·불일치'로 복원한다
      // (일치인데 mismatch 가 남는 모순 상태·차이 소실 방지).
      d.state = d.matchedAssetNo ? (d.mismatch ? '등록·불일치' : '등록·일치') : '미등록'
      d.note = `${d.note ? `${d.note} · ` : ''}${run.id} 재관측으로 생존 확인`
    }
  }

  // ── 신규 발견 — 선택한 채널이 잡을 수 있는 장비가 대기 풀에 있으면 드러난다
  const found = s.undiscovered.filter((u) => u.by.some((c) => input.channels.includes(c)))
  for (const u of found) {
    const id = nextId(`DSC-${today().slice(2, 4)}${today().slice(5, 7)}`)
    const channel = u.by.find((c) => input.channels.includes(c))!
    s.discovered.unshift({
      id,
      fingerprint: fingerprintOf(u),
      hostname: u.hostname,
      ip: u.ip,
      mac: u.mac,
      channel,
      type: u.type,
      firstSeen: today(),
      lastSeen: today(),
      state: '미등록',
      risk: u.risk,
      ownerCandidate: u.ownerCandidate,
      note: u.note,
    })
    s.observations.unshift({
      id: nextId('OBS'),
      discoveredId: id,
      channel,
      hostname: u.hostname,
      ip: u.ip,
      mac: u.mac,
      seenAt: at,
      detail: `${run.id} 신규 발견 — ${u.note}`,
    })
    run.observed += 1
    run.newFound += 1
  }
  s.undiscovered = s.undiscovered.filter((u) => !found.includes(u))

  run.status = '완료'
  run.finishedAt = nowMinute()
  s.scanRuns.unshift(run)

  appendAudit({
    actor: session.name,
    action: `스캔 실행 (${input.channels.length}채널 · 강도 ${input.intensity}) — 관측 ${run.observed}건, 신규 ${run.newFound}건${run.override ? ` · 시간대 밖 실행: ${run.override}` : ''}`,
    target: run.id,
  })
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message: run.newFound > 0
      ? `${run.id} 완료 — 관측 ${run.observed}건 (재관측 ${run.reobserved} · 신규 발견 ${run.newFound}). 발견 자산에서 확인하세요.`
      : `${run.id} 완료 — 관측 ${run.observed}건 전부 재관측. 신규 발견 없음.`,
  }
}
