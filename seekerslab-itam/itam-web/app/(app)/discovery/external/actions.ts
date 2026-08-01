'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { EasmRun } from '@/lib/types'

/** 외부 공격표면 재탐지 — 수동(무접촉) 수집으로 후보를 넓히고, 능동으로 생존·서비스·취약점을 확인한다.
 *  능동 탐지는 대상에 직접 접속하므로 사전 협의된 도메인에서만 허용한다 (제품안내서 §04 '수동 우선, 능동 확인'). */
export async function runEasmScan(input: { domains: string[]; mode: 'Passive' | 'Passive+Active'; note?: string }) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '재탐지 실행 권한이 없습니다.' }
  if (input.domains.length === 0) return { ok: false, message: '재탐지 도메인을 선택해 주세요.' }

  const s = getStore()
  const active = input.mode === 'Passive+Active'

  if (active) {
    const notApproved = input.domains.filter((d) => !s.easmTargets.find((t) => t.domain === d)?.activeApproved)
    if (notApproved.length > 0) {
      return {
        ok: false,
        message: `능동 탐지 미협의 도메인입니다 — ${notApproved.join(', ')}. 수동 수집만 실행하거나 대상 협의 후 진행하세요.`,
      }
    }
  }

  const at = nowMinute()
  const run: EasmRun = {
    id: nextId(`EASM-${today().slice(2, 4)}${today().slice(5, 7)}`),
    startedAt: at,
    domains: input.domains,
    mode: active ? 'Passive+Active' : 'Passive',
    status: '실행 중',
    candidates: 0,
    confirmed: 0,
    newFound: 0,
    by: session.name,
    note: input.note?.trim() || undefined,
  }

  // ── 수동 수집 — 대상에 흔적을 남기지 않고 후보를 넓힌다
  const pool = s.unseenExternal.filter((u) => input.domains.includes(u.domain))
  const surfaced = active ? pool : pool.filter((u) => u.mode === 'Passive')
  for (const u of surfaced) {
    s.external.unshift({
      id: nextId(`EXT-${today().slice(2, 4)}${today().slice(5, 7)}`),
      host: u.host,
      ip: u.ip,
      method: u.method,
      mode: u.mode,
      // 수동 수집 단계에서는 생존 미확인 — 능동 탐지를 함께 돌린 경우에만 확인된다
      alive: active && u.mode === 'Active',
      services: active ? u.services : undefined,
      cve: active ? u.cve : undefined,
      cvss: active ? u.cvss : undefined,
      risk: u.risk,
      firstSeen: today(),
      note: u.note,
      state: '미등록',
    })
    run.newFound += 1
  }
  s.unseenExternal = s.unseenExternal.filter((u) => !surfaced.includes(u))

  // 후보 수 — 수동 수집이 훑은 호스트명 규모(기존 관측 + 신규)
  run.candidates = s.external.filter((e) => input.domains.some((d) => e.host.endsWith(d))).length + surfaced.length

  // ── 능동 확인 — 기존 미확인 자산의 생존을 판정한다
  if (active) {
    for (const e of s.external) {
      if (!input.domains.some((d) => e.host.endsWith(d))) continue
      if (e.alive) continue
      // 과거 관측 호스트는 능동 확인으로 생존 여부가 갈린다. 여기서는 서비스 정보가 있으면 생존으로 본다.
      if (e.services) { e.alive = true; run.confirmed += 1 }
    }
    run.confirmed += surfaced.filter((u) => u.mode === 'Active').length
  }

  for (const d of input.domains) {
    const t = s.easmTargets.find((x) => x.domain === d)
    if (t) t.lastRunAt = today()
  }

  run.status = '완료'
  run.finishedAt = nowMinute()
  s.easmRuns.unshift(run)

  appendAudit({
    actor: session.name,
    action: `외부 공격표면 재탐지 (${run.mode}) — ${input.domains.join(', ')} · 신규 노출 ${run.newFound}건`,
    target: run.id,
  })
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message: run.newFound > 0
      ? `${run.id} 완료 — 신규 노출 자산 ${run.newFound}건${active ? ` · 생존 확인 ${run.confirmed}건` : ' (수동 수집 — 생존 미확인)'}`
      : `${run.id} 완료 — 신규 노출 없음${active ? ` · 생존 확인 ${run.confirmed}건` : ''}`,
  }
}
