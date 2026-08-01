'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { EasmRun } from '@/lib/types'

/** 유출 대응 조치 — 다크웹 유출 검출에서 끝내지 않고 보안 대응까지 이어간다.
 *  대응은 보안 업무이므로 보안담당·Admin 만. 조치 사실은 보안팀 앞 통지 + 감사 로그에 남는다. */
export async function respondToLeak(leakId: string, note: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '유출 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const action = note.trim()
  if (!action) return { ok: false, message: '대응 조치 내용을 입력하세요.' }

  const s = getStore()
  const leak = s.leaks.find((l) => l.id === leakId)
  if (!leak) return { ok: false, message: '유출 건을 찾을 수 없습니다.' }
  if (leak.status === '조치 완료') return { ok: false, message: '이미 조치 완료된 건입니다.' }

  leak.status = '조치 완료'
  leak.response = action
  leak.respondedBy = session.name
  leak.respondedAt = today()

  dispatch({ channel: '이메일', to: '보안운영팀', subject: `유출 대응 조치 — ${leak.kind}: ${action}`, kind: '위협 대응', ref: leak.id })
  appendAudit({ actor: session.name, action: `유출 대응 (${leak.kind}) — ${action}`, target: leak.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${leak.kind} 대응 완료 — 보안운영팀 통지·감사 기록 적재` }
}

/** 외부 노출 자산 조치 — 검출에서 끝내지 않고 편입(우리 자산이면 대장으로) 또는 차단(노출 차단·NAC 격리)까지 이어간다.
 *  외부 노출은 보안 의사결정이므로 보안담당·Admin 만. 요청 사실은 담당팀 통지 + 감사 로그에 남는다. */
export async function requestExternalAction(externalId: string, kind: '편입' | '차단') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '외부 노출 조치 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const e = s.external.find((x) => x.id === externalId)
  if (!e) return { ok: false, message: '노출 자산을 찾을 수 없습니다.' }
  if (e.action) return { ok: false, message: `이미 ${e.action} 처리된 건입니다.` }

  if (kind === '편입') {
    e.action = '편입요청'
    dispatch({ channel: '이메일', to: '자산관리팀', subject: `외부 노출 자산 편입 검토 — ${e.host} (${e.services ?? '-'})`, kind: '소유자 확인', ref: e.id })
    appendAudit({ actor: session.name, action: `외부 노출 자산 편입 요청 — ${e.host}`, target: e.id })
  } else {
    e.action = '차단요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `외부 노출 차단·격리 요청 — ${e.host} ${e.cve ? `(${e.cve})` : ''}`, kind: '격리 통보', ref: e.id })
    appendAudit({ actor: session.name, action: `외부 노출 차단 요청 — ${e.host}`, target: e.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${e.host} ${kind} 요청 — ${kind === '편입' ? '자산관리팀' : '보안운영팀'} 통지·감사 적재` }
}

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
