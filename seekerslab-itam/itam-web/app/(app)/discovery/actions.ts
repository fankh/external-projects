'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { can } from '@/lib/perm'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId } from '@/lib/store'
import { CONFIRM_DEADLINE_DAYS } from '@/lib/types'

/** 대장 편입 일괄 요청 — 스캔이 다수 자산을 올리면 한 건씩 누르지 않고 배치로 편입 결재를 상신한다.
 *  각 건은 여전히 자산담당 결재를 거치므로(대량 상신이라도 검토는 개별) 안전하다.
 *  이미 처리 중이거나 대사 완료(등록·일치)인 건은 건너뛴다. */
export async function requestOnboardMany(ids: string[]) {
  const session = await getSession()
  if (!session || !can('발견 자산 · CMDB 대사', '편입', session.role)) return { ok: false, message: '편입 요청 권한이 없습니다.' }
  const s = getStore()
  let n = 0
  for (const id of ids) {
    const d = s.discovered.find((x) => x.id === id)
    if (!d || d.action || d.state === '등록·일치') continue
    d.action = '편입요청'
    s.approvals.unshift({
      id: nextApprovalId(),
      kind: '자산 신청',
      title: `${d.id} (${d.hostname}) 대장 편입 — 발견 채널: ${d.channel}`,
      requester: session.name,
      dept: d.ownerCandidate ?? session.dept,
      requestedAt: today(),
      status: '대기',
      currentStep: '자산담당 검토',
      refId: d.id,
    })
    n += 1
  }
  if (n === 0) return { ok: false, message: '편입 요청할 대상이 없습니다 (이미 처리 중이거나 대사 완료).' }
  appendAudit({ actor: session.name, action: `대장 편입 일괄 요청 (${n}건)`, target: 'Discovery' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${n}건 편입 요청 상신 완료 — 자산담당 결재 대기` }
}

/** 소유자 확인 요청 — 편입·격리 앞단의 필수 단계. 부서에 확인 메일을 보내고 응답을 기다린다.
 *  (제품안내서 그림 3: 소유자 확인 → 편입/격리, AL-05 는 필수 결재) */
export async function requestOwnerConfirm(discoveredId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d) return { ok: false, message: '발견 자산을 찾을 수 없습니다.' }
  if (d.action) return { ok: false, message: `이미 처리 중입니다 — ${d.id} (${d.action})` }

  const to = d.ownerCandidate ?? '미지정 (전사 공지)'
  const id = nextApprovalId()
  s.approvals.unshift({
    id,
    kind: '소유자 확인',
    title: `${d.id} (${d.hostname}) 소유자 확인`,
    requester: 'Discovery 엔진',
    dept: d.ownerCandidate ?? session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: '부서 확인',
    refId: d.id,
    note: `${d.channel} 발견 · ${d.ip} · 최초 ${d.firstSeen}`,
  })
  d.action = '확인요청'
  d.confirmRequestedAt = today()

  const msg = dispatch({ channel: '이메일', to: `${to} (부서장)`, subject: `${d.id} 소유자 확인 요청`, kind: '소유자 확인', ref: id })
  appendAudit({ actor: session.name, action: `소유자 확인 요청 발송 (${msg.id})`, target: d.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 확인 요청 — ${to} 앞 이메일 발송 (${msg.id})` }
}

/** 미응답 에스컬레이션 — 기한(CONFIRM_DEADLINE_DAYS) 내 응답이 없는 확인 요청은 정책에 따라
 *  보안담당 검토 → NAC 격리 요청으로 자동 전환된다 (제품안내서 §04 미확인 소유자 정책). */
export async function escalateUnanswered() {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()

  const overdue = s.discovered.filter((d) => {
    if (d.action !== '확인요청' || !d.confirmRequestedAt) return false
    const elapsed = -(daysUntil(d.confirmRequestedAt) ?? 0)
    return elapsed >= CONFIRM_DEADLINE_DAYS
  })
  if (overdue.length === 0) return { ok: false, message: `기한(${CONFIRM_DEADLINE_DAYS}일) 경과한 미응답 건이 없습니다.` }

  for (const d of overdue) {
    // 진행 중이던 소유자 확인 결재는 반려 처리하고 격리 요청으로 승계한다
    for (const a of s.approvals.filter((x) => x.kind === '소유자 확인' && x.refId === d.id && x.status === '대기')) {
      a.status = '반려'
      a.currentStep = '완료'
      a.decidedAt = today()
      a.decidedBy = '정책 자동 (미응답)'
    }
    const id = nextApprovalId()
    s.approvals.unshift({
      id,
      kind: '격리 요청',
      title: `${d.id} (${d.hostname}) NAC 격리 — 소유자 확인 미응답 ${CONFIRM_DEADLINE_DAYS}일 경과`,
      requester: session.name,
      dept: session.dept,
      requestedAt: today(),
      status: '대기',
      currentStep: '보안담당 승인',
      refId: d.id,
      note: `확인 요청 ${d.confirmRequestedAt} 발송 후 무응답 — 정책 에스컬레이션`,
    })
    d.action = '격리요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `${d.id} 소유자 확인 미응답 — 격리 검토 요청`, kind: '에스컬레이션', ref: id })
  }

  appendAudit({ actor: session.name, action: `소유자 확인 미응답 에스컬레이션 (${overdue.length}건)`, target: 'Discovery' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `미응답 ${overdue.length}건을 격리 요청으로 에스컬레이션했습니다.` }
}

/** 수동 병합 — 자동 병합은 지문 일치에만 적용되므로, 지문이 갈렸지만 같은 장비로 판단되는
 *  건(호스트명 동일·MAC 상이 등)은 담당자가 확인해 합친다. 관측은 보존하고 대표 건으로 승계한다.
 *  (제품안내서 §04 정규화·병합 — 자산 지문 기반 중복 제거) */
export async function mergeDiscovered(primaryId: string, duplicateId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '병합 권한이 없습니다.' }
  if (primaryId === duplicateId) return { ok: false, message: '같은 항목은 병합할 수 없습니다.' }

  const s = getStore()
  const primary = s.discovered.find((x) => x.id === primaryId)
  const dup = s.discovered.find((x) => x.id === duplicateId)
  if (!primary || !dup) return { ok: false, message: '대상을 찾을 수 없습니다.' }
  if (dup.action) return { ok: false, message: `처리가 시작된 건은 병합할 수 없습니다 — ${dup.id} (${dup.action})` }

  // 관측을 대표 건으로 옮기고, 관측 범위에 맞춰 최초·최종 발견일을 다시 계산한다
  const moved = s.observations.filter((o) => o.discoveredId === dup.id)
  for (const o of moved) o.discoveredId = primary.id

  const all = s.observations.filter((o) => o.discoveredId === primary.id)
  const days = all.map((o) => o.seenAt.slice(0, 10)).sort()
  if (days.length > 0) {
    primary.firstSeen = days[0] < primary.firstSeen ? days[0] : primary.firstSeen
    primary.lastSeen = days[days.length - 1] > primary.lastSeen ? days[days.length - 1] : primary.lastSeen
  }
  // 위험도는 높은 쪽을 따른다 — 병합으로 위험이 낮아지면 안 된다
  const rank = { 높음: 3, 중간: 2, 낮음: 1 } as const
  if (rank[dup.risk] > rank[primary.risk]) primary.risk = dup.risk
  primary.note = `${primary.note ? `${primary.note} · ` : ''}${dup.id} 수동 병합 (${dup.mac !== '-' ? dup.mac : dup.ip})`

  s.discovered = s.discovered.filter((x) => x.id !== dup.id)

  appendAudit({ actor: session.name, action: `발견 자산 수동 병합 — ${dup.id} → ${primary.id} (관측 ${moved.length}건 승계)`, target: primary.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${dup.id} → ${primary.id} 병합 완료 — 관측 ${moved.length}건 승계, 총 ${all.length}건` }
}

/** 발견 자산 편입 요청 — 소유자 확인 → 자산 등록 결재를 통과해야 대장에 편입 (편입도 결재로) */
export async function requestOnboard(discoveredId: string) {
  const session = await getSession()
  // 매트릭스의 '발견 자산 · CMDB 대사 × 편입' 이 필요조건 — 화면에서 회수하면 실제로 막힌다
  if (!session || !can('발견 자산 · CMDB 대사', '편입', session.role)) return
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d || d.action) return
  d.action = '편입요청'
  s.approvals.unshift({
    id: nextApprovalId(),
    kind: '자산 신청',
    title: `${d.id} (${d.hostname}) 대장 편입 — 발견 채널: ${d.channel}`,
    requester: session.name,
    dept: d.ownerCandidate ?? session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: '자산담당 검토',
    refId: d.id,
  })
  appendAudit({ actor: session.name, action: `대장 편입 요청 상신 — ${d.hostname} (${d.channel})`, target: d.id })
  revalidatePath('/', 'layout')
}

/** NAC 격리 요청 — 미확인·미인가 자산 차단 (발견과 조치의 양방향 폐쇄 루프) */
export async function requestQuarantine(discoveredId: string) {
  const session = await getSession()
  if (!session || !can('발견 자산 · CMDB 대사', '격리요청', session.role)) return
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d || d.action) return
  d.action = '격리요청'
  s.approvals.unshift({
    id: nextApprovalId(),
    kind: '격리 요청',
    title: `${d.id} (${d.hostname}) NAC 격리 — ${d.note ?? '미확인 자산'}`,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: '보안담당 승인',
    refId: d.id,
  })
  appendAudit({ actor: session.name, action: `NAC 격리 요청 상신 — ${d.hostname}`, target: d.id })
  revalidatePath('/', 'layout')
}

/** 휴면 계정 조치 — AD/IdP·SSO 휴면 계정을 검출에서 끝내지 않고 비활성화 집행 또는 소유자(부서) 확인으로 이어간다.
 *  (제품안내서 §04 탐지 채널 06 · §06 AD/Entra 휴면 계정 발견) 계정 위생은 보안 업무이므로 보안담당·Admin 만.
 *  요청 사실은 담당 채널 통지 + 감사 로그에 남는다. 외부 노출 조치(requestExternalAction)와 동형. */
export async function respondToAccount(accountId: string, kind: '비활성화' | '소유자 확인') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '휴면 계정 조치 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const a = s.accounts.find((x) => x.id === accountId)
  if (!a) return { ok: false, message: '계정을 찾을 수 없습니다.' }
  if (a.action) return { ok: false, message: `이미 ${a.action} 처리된 계정입니다.` }

  a.actedBy = session.name
  a.actedAt = today()
  if (kind === '비활성화') {
    a.action = '비활성화 요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `휴면 계정 비활성화 집행 요청 — ${a.account} (${a.displayName}·${a.dept}, ${a.dormantDays}일 미로그인)`, kind: '위협 대응', ref: a.id })
    appendAudit({ actor: session.name, action: `휴면 계정 비활성화 요청 (${a.kind}) — ${a.account}`, target: a.id })
  } else {
    a.action = '소유자 확인 요청'
    dispatch({ channel: '이메일', to: a.dept, subject: `휴면 계정 사용 여부 확인 요청 — ${a.account} (${a.displayName}), 마지막 로그인 ${a.lastLogin}`, kind: '소유자 확인', ref: a.id })
    appendAudit({ actor: session.name, action: `휴면 계정 소유자 확인 요청 (${a.kind}) — ${a.account}`, target: a.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.account} ${a.action} — ${kind === '비활성화' ? '보안운영팀' : a.dept} 통지·감사 적재` }
}

/** 미인가 SW 조치 — EDR 검출 정책 위반 SW 를 제거 요청(사용자·보안운영팀 통지) 또는 예외 승인(업무 정당·화이트리스트)한다.
 *  (제품안내서 §03: "미인가 SW 설치는 Discovery 정책 위반 항목으로 연계되어 보안담당에게 통보") 보안담당·Admin 만.
 *  요청 사실은 설치 부서·보안운영팀 통지 + 감사 로그에 남는다. 외부 노출 조치(requestExternalAction)와 동형. */
export async function respondToUnauthorizedSw(swId: string, kind: '제거' | '예외 승인') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '미인가 SW 조치 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const w = s.unauthorizedSw.find((x) => x.id === swId)
  if (!w) return { ok: false, message: '미인가 SW 항목을 찾을 수 없습니다.' }
  if (w.action) return { ok: false, message: `이미 ${w.action} 처리된 항목입니다.` }

  w.actedBy = session.name
  w.actedAt = today()
  if (kind === '제거') {
    w.action = '제거 요청'
    dispatch({ channel: '이메일', to: w.dept, subject: `미인가 SW 제거 요청 — ${w.name} (${w.assetNo}·${w.owner}, ${w.kind})`, kind: '위협 대응', ref: w.id })
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `미인가 SW 제거 집행 확인 — ${w.name} @ ${w.assetNo}`, kind: '위협 대응', ref: w.id })
    appendAudit({ actor: session.name, action: `미인가 SW 제거 요청 (${w.kind}) — ${w.name} @ ${w.assetNo}`, target: w.id })
  } else {
    w.action = '예외 승인'
    dispatch({ channel: '이메일', to: w.dept, subject: `미인가 SW 예외 승인 — ${w.name} (${w.assetNo}) 업무상 사용 인정·카탈로그 등재`, kind: '위협 대응', ref: w.id })
    appendAudit({ actor: session.name, action: `미인가 SW 예외 승인 (${w.kind}) — ${w.name} @ ${w.assetNo}`, target: w.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${w.name} ${w.action} — ${w.dept} 통지·감사 적재` }
}
