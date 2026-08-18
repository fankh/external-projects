'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { isStaleVerify, roundProgressPct, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { Asset, RoundKind } from '@/lib/types'

/** 조사 대상 모수 — 폐기 완료 자산은 실물이 없으므로 제외한다.
 *  범위가 '전사'면 전량, 아니면 위치 문자열이 범위로 시작하는 자산(랙 단위 위치 포함). */
function inScope(a: Asset, scope: string): boolean {
  if (a.status === '폐기완료') return false
  if (scope === '전사') return true
  return a.location === scope || a.location.startsWith(`${scope} `)
}

/** 재물조사 계획 수립 — 연간/수시 회차를 만들고 대상 모수를 대장에서 산출한다.
 *  (제품안내서 §03: 연간/수시 조사 계획, 대상·담당자 지정) */
export async function planRound(input: {
  name: string
  kind: RoundKind
  scope: string
  assignee: string
  dueDate: string
}) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '조사 계획 수립 권한이 없습니다.' }
  }

  const name = input.name.trim()
  if (!name) return { ok: false, message: '회차명을 입력해 주세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { ok: false, message: '기한을 선택해 주세요.' }
  if (input.dueDate < today()) return { ok: false, message: '기한은 오늘 이후로 지정해 주세요.' }

  const s = getStore()
  if (s.inventoryRounds.some((r) => r.name === name)) {
    return { ok: false, message: `같은 이름의 회차가 이미 있습니다 — ${name}` }
  }

  // 대상 모수뿐 아니라 대상 자산번호 목록도 저장한다 — 이래야 실사 화면이 '무엇이 아직 미실사인지'를 알고,
  // 끝내 못 찾은 대장 자산을 분실 후보로 남긴다(자동 편성 회차와 동일 규약). 목록이 없으면 스캔한 것만 세고
  // 미스캔분은 조용히 사라져 재물조사의 본래 목적(누락·분실 탐지)이 닫히지 않는다.
  const inScopeAssets = s.assets.filter((a) => inScope(a, input.scope))
  const planned = inScopeAssets.length
  if (planned === 0) return { ok: false, message: `대상 자산이 없는 범위입니다 — ${input.scope}` }

  const id = nextId(`INV-${today().slice(0, 4)}`)
  s.inventoryRounds.unshift({
    id, name, kind: input.kind, scope: input.scope, planned,
    scanned: 0, mismatched: 0, dueDate: input.dueDate, assignee: input.assignee, status: '계획',
    targets: inScopeAssets.map((a) => a.assetNo),
  })

  appendAudit({ actor: session.name, action: `재물조사 계획 수립 (${input.kind} · 대상 ${planned}건)`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${name} 계획 등록 — 대상 ${planned.toLocaleString()}건, 담당 ${input.assignee}` }
}

/** 대사 '미확인'(유령 자산) 자동 편성 — 일정 기간 실측이 없는 자산을 수시 조사 회차로 묶는다.
 *  (제품안내서 §04 대사 결과별 처리: 미확인 → 유휴·분실 후보 → 재물조사 대상 자동 편성) */
export async function composeUnconfirmedRound() {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '조사 계획 수립 권한이 없습니다.' }
  }

  const s = getStore()
  const ghosts = s.discovered.filter((d) => d.state === '미확인')
  if (ghosts.length === 0) return { ok: false, message: '자동 편성할 미확인 자산이 없습니다.' }

  const already = new Set(s.inventoryRounds.flatMap((r) => r.targets ?? []))
  const fresh = ghosts.filter((g) => !already.has(g.id))
  if (fresh.length === 0) return { ok: false, message: '미확인 자산이 모두 기존 회차에 편성되어 있습니다.' }

  // 기한은 기준일 +14일 — 분실 판정을 미루지 않도록 수시 조사는 2주 내 마감한다
  const due = new Date(new Date(today()).getTime() + 14 * 86_400_000).toISOString().slice(0, 10)
  const id = nextId(`INV-${today().slice(0, 4)}-UNC`)
  s.inventoryRounds.unshift({
    id,
    name: `미확인 자산 확인 조사 (${today()})`,
    kind: '수시',
    scope: '대사 미확인 — 유휴·분실 후보',
    planned: fresh.length,
    scanned: 0,
    mismatched: 0,
    dueDate: due,
    assignee: session.name,
    status: '계획',
    targets: fresh.map((g) => g.id),
  })

  appendAudit({ actor: session.name, action: `미확인 자산 재물조사 자동 편성 (${fresh.length}건)`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `미확인 ${fresh.length}건을 수시 조사로 편성 — 기한 ${due}` }
}

/** 장기 미실측(유령 자산) 자동 편성 — 실사 데이터(대장 최근 실측일)에 근거해 오래 실측되지 않은 자산을
 *  수시 조사 회차로 묶는다. 대사 미확인(discovered 시드) 편성과 달리 대장의 실측 이력을 원천으로 한다.
 *  이미 편성 중(계획·진행중)인 회차에 잡힌 자산은 중복 편성하지 않는다. 자산담당·Admin. */
export async function composeStaleVerifyRound() {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '조사 계획 수립 권한이 없습니다.' }
  }

  const s = getStore()
  const stale = s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays))
  if (stale.length === 0) return { ok: false, message: '장기 미실측 자산이 없습니다.' }

  // 개시 전(계획)·진행 중 회차가 이미 대상으로 잡은 자산은 제외 — 완료 회차는 실측을 갱신했을 것이므로 무관
  const pending = new Set(
    s.inventoryRounds.filter((r) => r.status !== '완료').flatMap((r) => r.targets ?? []),
  )
  const fresh = stale.filter((a) => !pending.has(a.assetNo))
  if (fresh.length === 0) return { ok: false, message: '장기 미실측 자산이 모두 진행 중 회차에 편성되어 있습니다.' }

  const due = new Date(new Date(today()).getTime() + 14 * 86_400_000).toISOString().slice(0, 10)
  const id = nextId(`INV-${today().slice(0, 4)}-STV`)
  s.inventoryRounds.unshift({
    id,
    name: `장기 미실측 자산 확인 조사 (${today()})`,
    kind: '수시',
    scope: '장기 미실측 — 최근 실측 없음·경과',
    planned: fresh.length,
    scanned: 0,
    mismatched: 0,
    dueDate: due,
    assignee: session.name,
    status: '계획',
    targets: fresh.map((a) => a.assetNo),
  })

  appendAudit({ actor: session.name, action: `장기 미실측 자산 재물조사 자동 편성 (${fresh.length}건)`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `장기 미실측 ${fresh.length}건을 수시 조사로 편성 — 기한 ${due}` }
}

/** 재물조사 기한 경과 독촉 — 기한이 지났는데 미완료(계획·진행중)인 회차의 담당자에게 조사 완료를 촉구한다.
 *  그동안 회차 표는 '기한 경과'를 표시만 하고 담당자에게 밀어주는 수단이 없어, 다른 기한 경과 큐(대여·정기 점검·발주)와
 *  달리 신호에서 조치로 닫히지 않았다. 당일 중복 발송은 차단한다(수령·반환 독촉과 같은 컴플라이언스 독촉). 자산담당·Admin. */
export async function remindRound(roundId: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '재물조사 독촉 권한이 없습니다 (자산담당·Admin).' }
  }
  const s = getStore()
  const round = s.inventoryRounds.find((r) => r.id === roundId)
  if (!round) return { ok: false, message: '조사 회차를 찾을 수 없습니다.' }
  const t = today()
  if (round.status === '완료') return { ok: false, message: `이미 완료된 조사입니다 — ${round.name}` }
  if (round.dueDate >= t) return { ok: false, message: `기한이 경과하지 않았습니다 — ${round.name} (기한 ${round.dueDate})` }

  const sentToday = s.dispatches.some((m) => m.kind === '재물조사 독촉' && m.ref === roundId && m.at.startsWith(t))
  if (sentToday) return { ok: false, message: `오늘 이미 독촉을 발송했습니다 — ${round.name}` }

  const overdueDays = Math.floor((new Date(t).getTime() - new Date(round.dueDate).getTime()) / 86_400_000)
  dispatch({
    channel: '이메일',
    to: round.assignee,
    subject: `${round.id} ${round.name} 재물조사 기한 경과(D+${overdueDays}) — 진행 ${roundProgressPct(round)}%(${round.scanned}/${round.planned}) · 실물 확인 완료 요청`,
    kind: '재물조사 독촉',
    ref: roundId,
  })
  appendAudit({ actor: session.name, action: `재물조사 독촉 발송 — ${round.name} (D+${overdueDays})`, target: roundId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${round.assignee}에게 재물조사 독촉 발송 — ${round.name} 기한 경과 D+${overdueDays} (발송 이력 적재)` }
}

/** 계획 → 진행중 전환. 실사 화면은 '완료'가 아닌 회차만 대상으로 하므로 즉시 스캔이 가능해진다. */
export async function startRound(roundId: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) return
  const s = getStore()
  const round = s.inventoryRounds.find((r) => r.id === roundId)
  if (!round || round.status !== '계획') return
  round.status = '진행중'
  appendAudit({ actor: session.name, action: '재물조사 개시', target: roundId })
  revalidatePath('/', 'layout')
}

/** 재물조사 계획 취소 — 아직 개시하지 않은 계획 회차를 폐기한다 (잘못 만든/연기된 회차 정리).
 *  대상 편성은 참조일 뿐이라 취소해도 자산 상태는 그대로다. 취소하면 미확인 자산은 다시 편성 대상이 된다.
 *  진행중·완료 회차는 취소할 수 없다. 자산담당·Admin. */
export async function cancelRound(roundId: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) return { ok: false, message: '재물조사 계획 취소 권한이 없습니다.' }
  const s = getStore()
  const round = s.inventoryRounds.find((r) => r.id === roundId)
  if (!round) return { ok: false, message: '조사 회차를 찾을 수 없습니다.' }
  if (round.status !== '계획') return { ok: false, message: `개시·완료된 조사는 취소할 수 없습니다 — ${round.name} (${round.status})` }
  s.inventoryRounds = s.inventoryRounds.filter((r) => r.id !== roundId)
  appendAudit({ actor: session.name, action: `재물조사 계획 취소 — ${round.name}`, target: roundId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${round.name} 계획을 취소했습니다.` }
}
