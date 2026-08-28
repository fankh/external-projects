'use server'
import { DISPOSAL_STATUSES } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { appendAudit, denied } from '@/lib/audit'
import { daysUntil, dormantDaysOf, today } from '@/lib/dates'
import { dispatch, escalate } from '@/lib/notify'
import { can } from '@/lib/perm'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId } from '@/lib/store'

/** 대장 편입 일괄 요청 — 스캔이 다수 자산을 올리면 한 건씩 누르지 않고 배치로 편입 결재를 상신한다.
 *  각 건은 여전히 자산담당 결재를 거치므로(대량 상신이라도 검토는 개별) 안전하다.
 *  이미 처리 중이거나 대사 완료(등록·일치)인 건은 건너뛴다. */
export async function requestOnboardMany(ids: string[]) {
  const session = await getSession()
  if (!session) return { ok: false, message: '편입 요청 권한이 없습니다.' }
  if (!can('발견 자산 · CMDB 대사', '편입', session.role)) return denied(session.name, '편입 요청 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  let n = 0
  for (const id of ids) {
    const d = s.discovered.find((x) => x.id === id)
    // 미등록만 편입 — 등록·불일치(이미 매칭된 자산)를 편입하면 대장 중복이 생긴다(불일치는 재물조사 차이 조정으로 대사).
    if (!d || d.action || d.state !== '미등록') continue
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
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - n
  return { ok: true, message: `${n}건 편입 요청 상신 완료 — 자산담당 결재 대기${skippedB > 0 ? ` (이미 처리·대사 완료 ${skippedB}건 제외)` : ''}` }
}

/** 소유자 확인 요청 — 편입·격리 앞단의 필수 단계. 부서에 확인 메일을 보내고 응답을 기다린다.
 *  (제품안내서 그림 3: 소유자 확인 → 편입/격리, AL-05 는 필수 결재) */
export async function requestOwnerConfirm(discoveredId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '권한이 없습니다.', '/discovery/found')
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

/** 소유자 확인 일괄 요청 — 스캔이 정체 불명 장비를 다수 올리면 한 건씩 누르지 않고 배치로 소유자 확인 요청을 상신한다.
 *  각 건은 후보 부서(ownerCandidate)로 개별 확인 메일이 나가고 부서 확인 결재가 선다(편입 일괄 요청과 대칭). 이미 처리 중인 건은 건너뛴다(멱등). USER 제외. */
export async function requestOwnerConfirmMany(ids: string[]) {
  const session = await getSession()
  if (!session) return { ok: false, message: '소유자 확인 요청 권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '소유자 확인 요청 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  const targets = s.discovered.filter((d) => ids.includes(d.id) && !d.action)
  if (targets.length === 0) return { ok: false, message: '소유자 확인 요청할 대상이 없습니다 (이미 처리 중인 건 제외).' }
  for (const d of targets) {
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
    dispatch({ channel: '이메일', to: `${to} (부서장)`, subject: `${d.id} 소유자 확인 요청`, kind: '소유자 확인', ref: id })
  }
  appendAudit({ actor: session.name, action: `소유자 확인 일괄 요청 (${targets.length}건)`, target: 'Discovery' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `${targets.length}건 소유자 확인 요청 상신 — 후보 부서 앞 확인 메일 발송${skippedB > 0 ? ` (이미 처리 중 ${skippedB}건 제외)` : ''}` }
}

/** 관리 제외 — 발견 자산이 관리 대상이 아닌 알려진 비자산(협력사 장비·게스트 단말·비관리 어플라이언스 등)일 때
 *  편입도 격리도 아닌 '관리 제외'로 판정해 미등록 갭·Shadow IT 신호에서 뺀다.
 *  (그동안 편입/격리/확인만 있어, 관리 대상이 아닌 발견 건은 처리 경로가 없어 미등록 갭에 영구 잔존했다 — 컨셉 §3 '목록만 쌓인다'.)
 *  사유는 필수(감사·오판정 근거)이며 오판이면 '제외 해제'로 되돌린다. 미등록·미처리 건만 대상. USER 제외. */
export async function dismissDiscovered(discoveredId: string, rawReason: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '관리 제외 권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '관리 제외 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d) return { ok: false, message: '발견 자산을 찾을 수 없습니다.' }
  if (d.action) return { ok: false, message: `이미 처리 중입니다 — ${d.id} (${d.action})` }
  if (d.state !== '미등록') return { ok: false, message: '미등록 발견 건만 관리 제외할 수 있습니다.' }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '관리 제외 사유를 입력하세요 (비자산 판정 근거).' }
  d.action = '관리 제외'
  d.note = `관리 제외 (${reason}) — ${session.name} · ${today()}`
  appendAudit({ actor: session.name, action: `발견 자산 관리 제외 — ${d.hostname} (${reason})`, target: d.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 관리 제외 — 미등록 갭에서 제외 (사유: ${reason})` }
}

/** 관리 제외 일괄 — 스캔이 협력사 장비·게스트 단말 등 알려진 비자산을 다수 올리면 같은 사유로 한 번에 관리 제외한다(편입·소유자 확인 일괄 요청과 함께 발견 트리아지 3종 완결).
 *  건별 로직은 dismissDiscovered 와 동일하고 감사만 일괄로 남긴다. 미등록·미처리 건만 대상(멱등). USER 제외. */
export async function dismissDiscoveredMany(ids: string[], rawReason: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '관리 제외 권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '관리 제외 권한이 없습니다.', '/discovery/found')
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '관리 제외 사유를 입력하세요 (비자산 판정 근거).' }
  const s = getStore()
  const targets = s.discovered.filter((d) => ids.includes(d.id) && !d.action && d.state === '미등록')
  if (targets.length === 0) return { ok: false, message: '관리 제외할 대상이 없습니다 (미등록·미처리 건만 대상).' }
  for (const d of targets) {
    d.action = '관리 제외'
    d.note = `관리 제외 (${reason}) — ${session.name} · ${today()}`
  }
  const names = targets.map((d) => d.hostname).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `발견 자산 관리 제외 일괄 (${targets.length}건 · ${reason}) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: 'Discovery' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `${targets.length}건 관리 제외 — 미등록 갭에서 제외 (사유: ${reason})${skippedB > 0 ? ` · 제외 ${skippedB}건(미등록·미처리 아님)` : ''}` }
}

/** 관리 제외 해제 — 잘못 제외한 발견 건을 다시 미등록·미처리로 되돌려 편입/격리/확인 대상으로 복귀시킨다. USER 제외. */
export async function undismissDiscovered(discoveredId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '관리 제외 해제 권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '관리 제외 해제 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d) return { ok: false, message: '발견 자산을 찾을 수 없습니다.' }
  if (d.action !== '관리 제외') return { ok: false, message: '관리 제외 상태의 발견 건만 해제할 수 있습니다.' }
  d.action = undefined
  d.note = undefined
  appendAudit({ actor: session.name, action: `발견 자산 관리 제외 해제 — ${d.hostname}`, target: d.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 관리 제외 해제 — 미등록 처리 대상으로 복귀` }
}

/** 미응답 에스컬레이션 — 기한(CONFIRM_DEADLINE_DAYS) 내 응답이 없는 확인 요청은 정책에 따라
 *  보안담당 검토 → NAC 격리 요청으로 자동 전환된다 (제품안내서 §04 미확인 소유자 정책). */
export async function escalateUnanswered() {
  const session = await getSession()
  if (!session) return { ok: false, message: '권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '권한이 없습니다.', '/discovery/found')
  const s = getStore()

  const deadlineDays = s.opsPolicy.confirmDeadlineDays
  const overdue = s.discovered.filter((d) => {
    if (d.action !== '확인요청' || !d.confirmRequestedAt) return false
    const elapsed = -(daysUntil(d.confirmRequestedAt) ?? 0)
    return elapsed >= deadlineDays
  })
  if (overdue.length === 0) return { ok: false, message: `기한(${deadlineDays}일) 경과한 미응답 건이 없습니다.` }

  for (const d of overdue) {
    const id = nextApprovalId()
    // 진행 중이던 소유자 확인 결재는 반려 처리하고 격리 요청으로 승계한다.
    //  사람이 반려할 때(decide)는 사유가 필수인데 이 자동 반려만 사유를 안 남겨, 결재 이력 엑셀의
    //  '반려 사유' 칸이 '미기재'로 나갔다 — 시스템이 이유를 정확히 알면서 증적에는 비워 둔 셈이다.
    //  승계된 격리 요청 번호까지 적어 '왜 반려됐고 무엇으로 이어졌는지'가 한 줄로 추적되게 한다.
    for (const a of s.approvals.filter((x) => x.kind === '소유자 확인' && x.refId === d.id && x.status === '대기')) {
      a.status = '반려'
      a.currentStep = '완료'
      a.decidedAt = today()
      a.decidedBy = '정책 자동 (미응답)'
      a.rejectReason = `소유자 확인 요청 ${deadlineDays}일 미응답 — 정책 에스컬레이션으로 격리 요청(${id}) 승계`
    }
    s.approvals.unshift({
      id,
      kind: '격리 요청',
      title: `${d.id} (${d.hostname}) NAC 격리 — 소유자 확인 미응답 ${deadlineDays}일 경과`,
      requester: session.name,
      dept: session.dept,
      requestedAt: today(),
      status: '대기',
      currentStep: '보안담당 승인',
      refId: d.id,
      note: `확인 요청 ${d.confirmRequestedAt} 발송 후 무응답 — 정책 에스컬레이션`,
    })
    d.action = '격리요청'
    // 미응답 자산의 격리 에스컬레이션은 정책상 시간 임계 — 이메일 상세 + 문자 즉시 알림
    escalate({ to: '보안운영팀', subject: `${d.id} 소유자 확인 미응답 — 격리 검토 요청`, kind: '에스컬레이션', ref: id, sms: `미확인 자산 ${d.hostname} 격리 검토 — 소유자 무응답 경과` })
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
  if (!session) return { ok: false, message: '병합 권한이 없습니다.' }
  if (session.role === 'USER') return denied(session.name, '병합 권한이 없습니다.', '/discovery/found')
  if (primaryId === duplicateId) return { ok: false, message: '같은 항목은 병합할 수 없습니다.' }

  const s = getStore()
  const primary = s.discovered.find((x) => x.id === primaryId)
  const dup = s.discovered.find((x) => x.id === duplicateId)
  if (!primary || !dup) return { ok: false, message: '대상을 찾을 수 없습니다.' }
  if (dup.action) return { ok: false, message: `처리가 시작된 건은 병합할 수 없습니다 — ${dup.id} (${dup.action})` }
  // 대장 매칭 충돌 방지 — 서로 다른 대장 자산에 매칭된 두 건은 어느 정체성이 맞는지 모호해 자동 병합 금지(수동 확인 대상).
  if (primary.matchedAssetNo && dup.matchedAssetNo && primary.matchedAssetNo !== dup.matchedAssetNo) {
    return { ok: false, message: `서로 다른 대장 자산에 매칭된 건은 병합할 수 없습니다 — ${primary.matchedAssetNo} vs ${dup.matchedAssetNo}` }
  }

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
  // 대장 매칭·대사 상태 승계 — 대표 건에 매칭이 없고 중복 건에 있으면 이어받는다.
  // 안 그러면 대장에 매칭됐던 장비가 병합으로 '미등록'으로 되돌아가, 이후 편입 시 이미 대장에 있는 자산의 중복이 생긴다(대사 링크 소실).
  if (!primary.matchedAssetNo && dup.matchedAssetNo) {
    primary.matchedAssetNo = dup.matchedAssetNo
    primary.state = dup.state
    primary.mismatch = dup.mismatch
  }

  s.discovered = s.discovered.filter((x) => x.id !== dup.id)

  appendAudit({ actor: session.name, action: `발견 자산 수동 병합 — ${dup.id} → ${primary.id} (관측 ${moved.length}건 승계)`, target: primary.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${dup.id} → ${primary.id} 병합 완료 — 관측 ${moved.length}건 승계, 총 ${all.length}건` }
}

/** 발견 자산 편입 요청 — 소유자 확인 → 자산 등록 결재를 통과해야 대장에 편입 (편입도 결재로) */
export async function requestOnboard(discoveredId: string) {
  const session = await getSession()
  // 매트릭스의 '발견 자산 · CMDB 대사 × 편입' 이 필요조건 — 화면에서 회수하면 실제로 막힌다.
  //  거부를 undefined 로 끝내면 버튼이 아무 반응 없이 죽는다(무엇이 잘못됐는지 알 길이 없다) — 일괄 편입과 같이 사유를 돌려준다.
  if (!session) return { ok: false, message: '편입 요청 권한이 없습니다 (권한 · 정책의 편입 권한).' }
  if (!can('발견 자산 · CMDB 대사', '편입', session.role)) return denied(session.name, '편입 요청 권한이 없습니다 (권한 · 정책의 편입 권한).', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  // 미등록만 편입한다 — 등록·불일치(이미 대장에 매칭된 자산)를 편입하면 대장에 중복 자산이 생긴다.
  // 불일치(위치·상태 상이)는 재물조사 차이 조정(위치 불일치 → 대장 보정)으로 대사한다.
  if (!d || d.action || d.state !== '미등록') return { ok: false, message: '편입 요청 대상이 아닙니다 (이미 처리 중이거나 미등록이 아님).' }
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
  return { ok: true, message: `${d.id} (${d.hostname}) 편입 요청 상신 — 자산담당 결재 대기` }
}

/** NAC 격리 요청 — 미확인·미인가 자산 차단 (발견과 조치의 양방향 폐쇄 루프) */
export async function requestQuarantine(discoveredId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '격리 요청 권한이 없습니다 (권한 · 정책의 격리요청 권한).' }
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '격리 요청 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d || d.action) return { ok: false, message: '격리 요청 대상이 아닙니다 (이미 처리 중).' }
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
  return { ok: true, message: `${d.id} (${d.hostname}) NAC 격리 요청 상신 — 보안담당 승인 대기` }
}

/** CMDB 대사 확인 — 등록·불일치(대장에 매칭됐으나 위치·구성이 어긋난) 발견 자산을, 자산담당이 대장을 보정한 뒤
 *  '등록·일치'로 종결한다. 불일치는 재편입(중복 생성) 대상이 아니라 대장 보정으로 대사하는 것이 정해진 경로(v1.296).
 *  그동안 등록·불일치는 발견 화면에서 정보만 보이고 종결 액션이 없어 대사 루프가 열려 있었다. 발견 편입 권한자(자산담당·Admin). */
export async function confirmReconcile(discoveredId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '대사 확인 권한이 없습니다.' }
  if (!can('발견 자산 · CMDB 대사', '편입', session.role)) return denied(session.name, '대사 확인 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d) return { ok: false, message: '발견 자산을 찾을 수 없습니다.' }
  if (d.state !== '등록·불일치') return { ok: false, message: '등록·불일치 건만 대사 확인할 수 있습니다.' }

  const priorMismatch = d.mismatch
  const asset = d.matchedAssetNo ? s.assets.find((a) => a.assetNo === d.matchedAssetNo) : undefined
  // 폐기 경로 자산에는 실측값을 반영하지 않는다 — 대사 확인은 곧 대장 보정이라, 폐기한 자산의 위치·소유자를
  //  실측대로 되살리고 '등록·일치'로 종결하면 폐기 기록과 대장이 정면으로 어긋난다(생존 확인과 같은 이유).
  if (asset && DISPOSAL_STATUSES.includes(asset.status)) {
    return { ok: false, message: `폐기 처리 중·완료 자산이 재관측됐습니다 — ${asset.assetNo} (${asset.status}). 대사 확인으로 대장을 되돌리지 말고 폐기 기록과 관측 중 어느 쪽이 맞는지 확인하세요.` }
  }

  // 실측이 대장과 다른 필드가 구조화돼 있으면(mismatchField/observedValue) 대사 확인이 곧 대장 보정이다.
  // correctField 는 빈 필드 채움만 허용하고, 기존 오값의 정정은 이동·불출(실물 이동) 절차뿐이라 —
  // 실물은 그대로인데 대장값만 틀린 데이터 불일치는 보정 경로가 없었다. 그 공백을 대사 확인이 닫는다.
  const FIELD_KEY = { 위치: 'location', 소유자: 'owner', 부서: 'dept' } as const
  let correction = ''
  if (asset && d.mismatchField && d.observedValue) {
    const key = FIELD_KEY[d.mismatchField]
    const before = asset[key]
    if (before !== d.observedValue) {
      asset[key] = d.observedValue
      asset.history.push({ date: today(), kind: '점검', detail: `CMDB 대사 실측 반영 — ${d.mismatchField} ${before} → ${d.observedValue} (${d.channel} 발견, ${d.id})`, actor: session.name })
      correction = ` · ${d.mismatchField} ${before}→${d.observedValue} 보정`
    }
  } else if (asset) {
    // 필드가 특정되지 않은 불일치(구성 상이 등)는 담당자 판단으로 검토·정정한 뒤 종결 표시만 남긴다.
    asset.history.push({ date: today(), kind: '점검', detail: `CMDB 대사 확인 — ${d.channel} 발견 불일치 검토·정정 완료${priorMismatch ? ` (${priorMismatch})` : ''} (${d.id})`, actor: session.name })
  }

  d.state = '등록·일치'
  d.mismatch = undefined // 불일치 해소
  d.mismatchField = undefined
  d.observedValue = undefined
  appendAudit({ actor: session.name, action: `CMDB 대사 확인 — ${d.hostname} 등록·일치 처리${correction}`, target: d.matchedAssetNo ?? d.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 대사 확인 — 등록·일치 종결${correction || (d.matchedAssetNo ? ` (${d.matchedAssetNo} 이력 적재)` : '')}` }
}

/** 대사 생존 확인 — 등록·일치(대장 매칭) 재관측을 대장 '최근 실측일'로 확정한다(§04 그림3: 등록·일치 = 생존 신호).
 *  그동안 최근 실측일(lastVerifiedAt)은 물리 재물조사 실사에서만 갱신돼, 네트워크·EDR 이 매일 살아있음을 재관측해도
 *  물리 방문이 밀린 원격·원격지 자산은 장기 미실측(유령 자산 후보)으로 오탐돼 재물조사 자동 편성까지 흘렀다.
 *  Discovery 의 생존 재관측을 담당자가 확정하면 대장 최근 실측일이 오늘로 갱신돼 장기 미실측·미확인 집계에서 빠진다. */
export async function confirmSurvival(discoveredId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '대사 생존 확인 권한이 없습니다.' }
  if (!can('발견 자산 · CMDB 대사', '편입', session.role)) return denied(session.name, '대사 생존 확인 권한이 없습니다.', '/discovery/found')
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d) return { ok: false, message: '발견 자산을 찾을 수 없습니다.' }
  if (d.state !== '등록·일치' || !d.matchedAssetNo) return { ok: false, message: '등록·일치(대장 매칭) 재관측 건만 생존 확인할 수 있습니다.' }
  if (d.survivalConfirmedAt) return { ok: false, message: `이미 생존 확인된 재관측입니다 — ${d.id} (${d.survivalConfirmedAt})` }
  const asset = s.assets.find((a) => a.assetNo === d.matchedAssetNo)
  if (!asset) return { ok: false, message: '대사 자산을 찾을 수 없습니다.' }
  // 폐기 경로 자산은 '생존 확인'으로 닫을 수 없다 — 대장은 폐기라는데 네트워크에서 관측됐다면 둘 중 하나가 틀린 것이고,
  //  그 자체가 조사할 신호다(폐기 처리했다는 장비가 아직 살아 있다). 최근 실측일만 갱신하면 그 모순이 조용히 덮인다.
  //  반납·대여·차이 조정의 스테일 방어와 같은 규약 — 상태가 어긋나면 적용하지 않고 사유를 돌려준다.
  if (DISPOSAL_STATUSES.includes(asset.status)) {
    return { ok: false, message: `폐기 처리 중·완료 자산이 재관측됐습니다 — ${asset.assetNo} (${asset.status}). 생존 확인으로 닫지 말고 폐기 기록과 관측 중 어느 쪽이 맞는지 확인하세요.` }
  }

  const before = asset.lastVerifiedAt ?? '미실측'
  asset.lastVerifiedAt = today() // 재관측 확정 = 생존 신호. 최근 실측일을 오늘로 갱신해 장기 미실측에서 빠진다.
  d.survivalConfirmedAt = today()
  asset.history.push({ date: today(), kind: '점검', detail: `CMDB 대사 생존 확인 — ${d.channel} 재관측(최근 ${d.lastSeen}) 최근 실측일 갱신 (이전 ${before}) (${d.id})`, actor: session.name })
  appendAudit({ actor: session.name, action: `CMDB 대사 생존 확인 — ${asset.assetNo} 최근 실측일 갱신 (이전 ${before})`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 생존 확인 — ${asset.assetNo} 최근 실측일 오늘로 갱신(장기 미실측 해소)` }
}

/** 휴면 계정 조치 — AD/IdP·SSO 휴면 계정을 검출에서 끝내지 않고 비활성화 집행 또는 소유자(부서) 확인으로 이어간다.
 *  (제품안내서 §04 탐지 채널 06 · §06 AD/Entra 휴면 계정 발견) 계정 위생은 보안 업무이므로 보안담당·Admin 만.
 *  요청 사실은 담당 채널 통지 + 감사 로그에 남는다. 외부 노출 조치(requestExternalAction)와 동형. */
export async function respondToAccount(accountId: string, kind: '비활성화' | '소유자 확인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '휴면 계정 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '휴면 계정 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '휴면 계정 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const a = s.accounts.find((x) => x.id === accountId)
  if (!a) return { ok: false, message: '계정을 찾을 수 없습니다.' }
  if (a.action) return { ok: false, message: `이미 ${a.action} 처리된 계정입니다.` }

  a.actedBy = session.name
  a.actedAt = today()
  if (kind === '비활성화') {
    a.action = '비활성화 요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `휴면 계정 비활성화 집행 요청 — ${a.account} (${a.displayName}·${a.dept}, ${dormantDaysOf(a, today()) === null ? '로그인 이력 없음' : `${dormantDaysOf(a, today())}일 미로그인`})`, kind: '위협 대응', ref: a.id })
    appendAudit({ actor: session.name, action: `휴면 계정 비활성화 요청 (${a.kind}) — ${a.account}`, target: a.id })
  } else {
    a.action = '소유자 확인 요청'
    dispatch({ channel: '이메일', to: a.dept, subject: `휴면 계정 사용 여부 확인 요청 — ${a.account} (${a.displayName}), 마지막 로그인 ${a.lastLogin}`, kind: '소유자 확인', ref: a.id })
    appendAudit({ actor: session.name, action: `휴면 계정 소유자 확인 요청 (${a.kind}) — ${a.account}`, target: a.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.account} ${a.action} — ${kind === '비활성화' ? '보안운영팀' : a.dept} 통지·감사 적재` }
}

/** 휴면 계정 일괄 조치 — 분기 접근 권한 재인증(access certification) 스윕에서 미로그인 계정을 한 번에 비활성화(또는 소유자 확인)한다.
 *  건별 로직은 respondToAccount 와 동일하고 감사만 일괄로 남긴다. 이미 조치된 계정은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToAccountMany(ids: string[], kind: '비활성화' | '소유자 확인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '휴면 계정 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '휴면 계정 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '휴면 계정 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const targets = s.accounts.filter((a) => ids.includes(a.id) && !a.action)
  if (targets.length === 0) return { ok: false, message: '조치할 휴면 계정이 없습니다 (이미 처리된 건 제외).' }
  for (const a of targets) {
    a.actedBy = session.name
    a.actedAt = today()
    if (kind === '비활성화') {
      a.action = '비활성화 요청'
      dispatch({ channel: '이메일', to: '보안운영팀', subject: `휴면 계정 비활성화 집행 요청 — ${a.account} (${a.displayName}·${a.dept}, ${dormantDaysOf(a, today()) === null ? '로그인 이력 없음' : `${dormantDaysOf(a, today())}일 미로그인`})`, kind: '위협 대응', ref: a.id })
    } else {
      a.action = '소유자 확인 요청'
      dispatch({ channel: '이메일', to: a.dept, subject: `휴면 계정 사용 여부 확인 요청 — ${a.account} (${a.displayName}), 마지막 로그인 ${a.lastLogin}`, kind: '소유자 확인', ref: a.id })
    }
  }
  const verb = kind === '비활성화' ? '비활성화 요청' : '소유자 확인 요청'
  const names = targets.map((a) => a.account).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `휴면 계정 일괄 ${verb} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: '휴면 계정' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `휴면 계정 ${targets.length}건 ${verb} — ${kind === '비활성화' ? '보안운영팀' : '해당 부서'} 통지·감사 적재${skippedB > 0 ? ` (이미 처리 ${skippedB}건 제외)` : ''}` }
}

/** 휴면 계정 소유자 확인 결과 처리 — 소유자(부서) 확인 요청에 대한 응답을 반영해 루프를 닫는다.
 *  (그동안 '소유자 확인 요청'은 부서에 메일만 나가고 결과를 반영할 경로가 없어 그 상태로 방치됐다 — 발견 자산 소유자 확인이 응답·에스컬레이션으로 닫히는 것과 대비.)
 *  keep=true(사용 확인): 유효 계정으로 판정해 휴면 리스크에서 정리. keep=false(비활성화): 미사용 확정으로 비활성화 집행 요청으로 전환. 확인 요청 상태만 대상. 보안담당·Admin. */
export async function resolveAccountReview(accountId: string, keep: boolean) {
  const session = await getSession()
  if (!session) return { ok: false, message: '휴면 계정 확인 처리 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '휴면 계정 확인 처리 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '휴면 계정 확인 처리 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const a = s.accounts.find((x) => x.id === accountId)
  if (!a) return { ok: false, message: '계정을 찾을 수 없습니다.' }
  if (a.action !== '소유자 확인 요청') return { ok: false, message: '소유자 확인 요청 상태의 계정만 결과를 처리할 수 있습니다.' }
  a.actedBy = session.name
  a.actedAt = today()
  if (keep) {
    a.action = '사용 확인'
    appendAudit({ actor: session.name, action: `휴면 계정 사용 확인(유효 계정) — ${a.account} (${a.displayName}) · 휴면 리스크 정리`, target: a.id })
    revalidatePath('/', 'layout')
    return { ok: true, message: `${a.account} 사용 확인 — 유효 계정으로 판정, 휴면 리스크에서 정리` }
  }
  a.action = '비활성화 요청'
  dispatch({ channel: '이메일', to: '보안운영팀', subject: `휴면 계정 비활성화 집행 요청 — ${a.account} (${a.displayName}·${a.dept}, 소유자 확인 결과 미사용 확정)`, kind: '위협 대응', ref: a.id })
  appendAudit({ actor: session.name, action: `휴면 계정 비활성화 요청(확인 결과 미사용) — ${a.account}`, target: a.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.account} 비활성화 요청 — 확인 결과 미사용 확정, 보안운영팀 통지·감사 적재` }
}

/** 미인가 SW 조치 — EDR 검출 정책 위반 SW 를 제거 요청(사용자·보안운영팀 통지) 또는 예외 승인(업무 정당·화이트리스트)한다.
 *  (제품안내서 §03: "미인가 SW 설치는 Discovery 정책 위반 항목으로 연계되어 보안담당에게 통보") 보안담당·Admin 만.
 *  요청 사실은 설치 부서·보안운영팀 통지 + 감사 로그에 남는다. 외부 노출 조치(requestExternalAction)와 동형. */
export async function respondToUnauthorizedSw(swId: string, kind: '제거' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '미인가 SW 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '미인가 SW 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '미인가 SW 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
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
    // 예외 승인은 해당 건 표시로 끝나지 않고 SW 화이트리스트에 등재된다 — 같은 SW 재검출 시 참조되는 재사용 정책(§01 보안담당: 미인가 SW 정책 관리)
    let registered = false
    if (!s.swAllowlist.some((e) => e.name.toLowerCase() === w.name.toLowerCase())) {
      s.swAllowlist.unshift({ name: w.name, approvedBy: session.name, approvedAt: today(), note: `${w.kind} 예외 승인 — ${w.dept}(${w.assetNo}) 업무상 정당` })
      registered = true
    }
    dispatch({ channel: '이메일', to: w.dept, subject: `미인가 SW 예외 승인 — ${w.name} (${w.assetNo}) 업무상 사용 인정·화이트리스트 등재`, kind: '위협 대응', ref: w.id })
    appendAudit({ actor: session.name, action: `미인가 SW 예외 승인 (${w.kind}) — ${w.name} @ ${w.assetNo}${registered ? ' · 화이트리스트 등재' : ''}`, target: w.id })
    revalidatePath('/', 'layout')
    return { ok: true, message: `${w.name} 예외 승인 — ${w.dept} 통지·감사${registered ? ' · 화이트리스트 등재' : ' (이미 화이트리스트)'}` }
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${w.name} ${w.action} — ${w.dept} 통지·감사 적재` }
}

/** 미인가 SW 일괄 조치 — 새로 금지된 SW·EDR 스윕으로 같은 위반이 수십 대에 한꺼번에 잡히는 상황에서 선택 건을 한 번에 처리한다.
 *  건별 로직(제거 요청 통보·예외 승인 화이트리스트 등재)은 respondToUnauthorizedSw 와 동일하고, 감사만 일괄로 남긴다.
 *  이미 조치된 건은 건너뛴다(멱등). 보안담당·Admin. (requestOnboardMany·decideMany 와 같은 일괄 패턴) */
export async function respondToUnauthorizedSwMany(ids: string[], kind: '제거' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '미인가 SW 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '미인가 SW 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '미인가 SW 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const targets = s.unauthorizedSw.filter((w) => ids.includes(w.id) && !w.action)
  if (targets.length === 0) return { ok: false, message: '조치할 미인가 SW 항목이 없습니다 (이미 처리된 건 제외).' }
  let registered = 0
  for (const w of targets) {
    w.actedBy = session.name
    w.actedAt = today()
    if (kind === '제거') {
      w.action = '제거 요청'
      dispatch({ channel: '이메일', to: w.dept, subject: `미인가 SW 제거 요청 — ${w.name} (${w.assetNo}·${w.owner}, ${w.kind})`, kind: '위협 대응', ref: w.id })
      dispatch({ channel: '이메일', to: '보안운영팀', subject: `미인가 SW 제거 집행 확인 — ${w.name} @ ${w.assetNo}`, kind: '위협 대응', ref: w.id })
    } else {
      w.action = '예외 승인'
      if (!s.swAllowlist.some((e) => e.name.toLowerCase() === w.name.toLowerCase())) {
        s.swAllowlist.unshift({ name: w.name, approvedBy: session.name, approvedAt: today(), note: `${w.kind} 예외 승인 — ${w.dept}(${w.assetNo}) 업무상 정당 (일괄)` })
        registered += 1
      }
      dispatch({ channel: '이메일', to: w.dept, subject: `미인가 SW 예외 승인 — ${w.name} (${w.assetNo}) 업무상 사용 인정·화이트리스트 등재`, kind: '위협 대응', ref: w.id })
    }
  }
  const verb = kind === '제거' ? '제거 요청' : '예외 승인'
  const names = targets.map((w) => w.name).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `미인가 SW 일괄 ${verb} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: '미인가 SW' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `미인가 SW ${targets.length}건 ${verb} — 담당 부서 통지·감사 적재${kind === '예외 승인' && registered ? ` · 화이트리스트 ${registered}건 등재` : ''}${skippedB > 0 ? ` (이미 처리 ${skippedB}건 제외)` : ''}` }
}

/** SW 화이트리스트 해제 — 예외 승인으로 등재된 SW 를 목록에서 뺀다. 해제하면 그 SW 는 다시 미인가 SW 정책 대상이 된다.
 *  (제품안내서 §01 보안담당: 미인가 SW 정책 관리) 보안담당·Admin 만. 정책 변경이므로 감사에 남긴다. */
export async function removeSwAllow(name: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: 'SW 정책 관리 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, 'SW 정책 관리 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, 'SW 정책 관리 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const before = s.swAllowlist.length
  s.swAllowlist = s.swAllowlist.filter((e) => e.name.toLowerCase() !== name.toLowerCase())
  if (s.swAllowlist.length === before) return { ok: false, message: `화이트리스트에 없는 SW 입니다 — ${name}` }
  appendAudit({ actor: session.name, action: `SW 화이트리스트 해제 — ${name} (다시 미인가 SW 정책 대상)`, target: name })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${name} 화이트리스트 해제 — 다시 정책 대상으로 전환` }
}

/** USB 저장매체 조치 — EDR 검출 이동식 매체 정책 위반을 차단(EDR 장치 제어) 또는 예외 승인(등록 업무용 매체)한다.
 *  (제품안내서 §04 채널 04 EDR: USB) 데이터 유출(DLP) 통제이므로 보안담당·Admin 만. 요청은 설치 부서·보안운영팀 통지 + 감사 로그에 남는다. */
export async function respondToUsb(usbId: string, kind: '차단' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: 'USB 저장매체 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, 'USB 저장매체 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, 'USB 저장매체 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const u = s.usbFindings.find((x) => x.id === usbId)
  if (!u) return { ok: false, message: 'USB 검출 항목을 찾을 수 없습니다.' }
  if (u.action) return { ok: false, message: `이미 ${u.action} 처리된 항목입니다.` }

  u.actedBy = session.name
  u.actedAt = today()
  if (kind === '차단') {
    u.action = '차단 요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `USB 매체 차단 집행 요청 — ${u.device} @ ${u.assetNo} (${u.owner}·${u.dept}, ${u.kind})`, kind: '위협 대응', ref: u.id })
    appendAudit({ actor: session.name, action: `USB 저장매체 차단 요청 (${u.kind}) — ${u.device} @ ${u.assetNo}`, target: u.id })
  } else {
    u.action = '예외 승인'
    dispatch({ channel: '이메일', to: u.dept, subject: `USB 매체 예외 승인 — ${u.device} (${u.assetNo}) 업무용 등록·반입 인정`, kind: '위협 대응', ref: u.id })
    appendAudit({ actor: session.name, action: `USB 저장매체 예외 승인 (${u.kind}) — ${u.device} @ ${u.assetNo}`, target: u.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${u.device} ${u.action} — ${kind === '차단' ? '보안운영팀' : u.dept} 통지·감사 적재` }
}

/** 로컬 가상머신 조치 — EDR 검출 로컬 VM 정책 위반을 회수(하이퍼바이저 제거·VM 삭제) 또는 예외 승인(등록 개발용 VM)한다.
 *  (제품안내서 §04 채널 04 EDR: 로컬 가상머신) 관리 사각지대 통제이므로 보안담당·Admin 만. 요청은 실행 부서·보안운영팀 통지 + 감사 로그에 남는다. */
export async function respondToLocalVm(vmId: string, kind: '회수' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '로컬 VM 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '로컬 VM 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '로컬 VM 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const v = s.localVms.find((x) => x.id === vmId)
  if (!v) return { ok: false, message: '로컬 VM 검출 항목을 찾을 수 없습니다.' }
  if (v.action) return { ok: false, message: `이미 ${v.action} 처리된 항목입니다.` }

  v.actedBy = session.name
  v.actedAt = today()
  if (kind === '회수') {
    v.action = '회수 요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `로컬 VM 회수 집행 요청 — ${v.vm} (${v.guestOs}) @ ${v.assetNo} (${v.owner}·${v.dept}, ${v.kind})`, kind: '위협 대응', ref: v.id })
    appendAudit({ actor: session.name, action: `로컬 VM 회수 요청 (${v.kind}) — ${v.vm} @ ${v.assetNo}`, target: v.id })
  } else {
    v.action = '예외 승인'
    dispatch({ channel: '이메일', to: v.dept, subject: `로컬 VM 예외 승인 — ${v.vm} (${v.assetNo}) 업무용 등록 인정`, kind: '위협 대응', ref: v.id })
    appendAudit({ actor: session.name, action: `로컬 VM 예외 승인 (${v.kind}) — ${v.vm} @ ${v.assetNo}`, target: v.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${v.vm} ${v.action} — ${kind === '회수' ? '보안운영팀' : v.dept} 통지·감사 적재` }
}

/** USB 저장매체 일괄 조치 — 새 매체통제 정책·EDR 스윕으로 다수 단말에 같은 위반이 잡히면 선택해 한 번에 차단(또는 예외 승인).
 *  건별 로직은 respondToUsb 와 동일하고 감사만 일괄로 남긴다. 이미 조치된 항목은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToUsbMany(ids: string[], kind: '차단' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: 'USB 저장매체 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, 'USB 저장매체 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, 'USB 저장매체 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const targets = s.usbFindings.filter((u) => ids.includes(u.id) && !u.action)
  if (targets.length === 0) return { ok: false, message: '조치할 USB 검출 항목이 없습니다 (이미 처리된 건 제외).' }
  for (const u of targets) {
    u.actedBy = session.name
    u.actedAt = today()
    if (kind === '차단') {
      u.action = '차단 요청'
      dispatch({ channel: '이메일', to: '보안운영팀', subject: `USB 매체 차단 집행 요청 — ${u.device} @ ${u.assetNo} (${u.owner}·${u.dept}, ${u.kind})`, kind: '위협 대응', ref: u.id })
    } else {
      u.action = '예외 승인'
      dispatch({ channel: '이메일', to: u.dept, subject: `USB 매체 예외 승인 — ${u.device} (${u.assetNo}) 업무용 등록·반입 인정`, kind: '위협 대응', ref: u.id })
    }
  }
  const verb = kind === '차단' ? '차단 요청' : '예외 승인'
  const names = targets.map((u) => u.device).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `USB 저장매체 일괄 ${verb} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: 'USB 저장매체' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `USB ${targets.length}건 ${verb} — ${kind === '차단' ? '보안운영팀' : '해당 부서'} 통지·감사 적재${skippedB > 0 ? ` (이미 처리 ${skippedB}건 제외)` : ''}` }
}

/** 로컬 가상머신 일괄 조치 — 매체통제·하이퍼바이저 금지 정책 스윕으로 다수 단말의 로컬 VM을 선택해 한 번에 회수(또는 예외 승인).
 *  건별 로직은 respondToLocalVm 과 동일하고 감사만 일괄로 남긴다. 이미 조치된 항목은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToLocalVmMany(ids: string[], kind: '회수' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '로컬 VM 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '로컬 VM 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '로컬 VM 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const targets = s.localVms.filter((v) => ids.includes(v.id) && !v.action)
  if (targets.length === 0) return { ok: false, message: '조치할 로컬 VM 검출 항목이 없습니다 (이미 처리된 건 제외).' }
  for (const v of targets) {
    v.actedBy = session.name
    v.actedAt = today()
    if (kind === '회수') {
      v.action = '회수 요청'
      dispatch({ channel: '이메일', to: '보안운영팀', subject: `로컬 VM 회수 집행 요청 — ${v.vm} (${v.guestOs}) @ ${v.assetNo} (${v.owner}·${v.dept}, ${v.kind})`, kind: '위협 대응', ref: v.id })
    } else {
      v.action = '예외 승인'
      dispatch({ channel: '이메일', to: v.dept, subject: `로컬 VM 예외 승인 — ${v.vm} (${v.assetNo}) 업무용 등록 인정`, kind: '위협 대응', ref: v.id })
    }
  }
  const verb = kind === '회수' ? '회수 요청' : '예외 승인'
  const names = targets.map((v) => v.vm).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `로컬 VM 일괄 ${verb} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: '로컬 VM' })
  revalidatePath('/', 'layout')
  // 건너뛴 선택분을 결과에 밝힌다 — 처리 수만 돌려주면 조작자는 선택분이 전부 처리된 줄 안다(자산 일괄 조치와 같은 규약).
  const skippedB = ids.length - targets.length
  return { ok: true, message: `로컬 VM ${targets.length}건 ${verb} — ${kind === '회수' ? '보안운영팀' : '해당 부서'} 통지·감사 적재${skippedB > 0 ? ` (이미 처리 ${skippedB}건 제외)` : ''}` }
}

/** USB 매체 예외 승인 해제 — 잘못 승인했거나 정책이 바뀐 예외 등록을 되돌려 다시 미조치(차단/예외 판정 대상)로 전환한다.
 *  (SW 화이트리스트 해제(removeSwAllow)와 같은 규약 — 예외 승인은 오판정될 수 있어 되돌릴 수 있어야 한다. 그동안 USB·VM 예외는 비가역이었다.)
 *  '예외 승인' 상태만 해제 대상. 차단 요청은 보안 집행이라 이 경로로 되돌리지 않는다. 보안담당·Admin. */
export async function revokeUsbException(usbId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: 'USB 예외 해제 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, 'USB 예외 해제 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, 'USB 예외 해제 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const u = s.usbFindings.find((x) => x.id === usbId)
  if (!u) return { ok: false, message: 'USB 검출 항목을 찾을 수 없습니다.' }
  if (u.action !== '예외 승인') return { ok: false, message: '예외 승인 상태의 USB 항목만 해제할 수 있습니다.' }
  u.action = undefined
  u.actedBy = undefined
  u.actedAt = undefined
  appendAudit({ actor: session.name, action: `USB 저장매체 예외 승인 해제 — ${u.device} @ ${u.assetNo} (다시 정책 대상)`, target: u.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${u.device} 예외 승인 해제 — 다시 미조치(차단/예외 판정) 대상으로 전환` }
}

/** 로컬 VM 예외 승인 해제 — USB 예외 해제와 동일 규약. '예외 승인' 상태만 대상. 보안담당·Admin. */
export async function revokeVmException(vmId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로컬 VM 예외 해제 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '로컬 VM 예외 해제 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '로컬 VM 예외 해제 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const v = s.localVms.find((x) => x.id === vmId)
  if (!v) return { ok: false, message: '로컬 VM 검출 항목을 찾을 수 없습니다.' }
  if (v.action !== '예외 승인') return { ok: false, message: '예외 승인 상태의 로컬 VM 항목만 해제할 수 있습니다.' }
  v.action = undefined
  v.actedBy = undefined
  v.actedAt = undefined
  appendAudit({ actor: session.name, action: `로컬 VM 예외 승인 해제 — ${v.vm} @ ${v.assetNo} (다시 정책 대상)`, target: v.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${v.vm} 예외 승인 해제 — 다시 미조치(회수/예외 판정) 대상으로 전환` }
}

/** 미관리 클라우드 리소스 조치 (탐지 채널 05 CSP API) — 태그·소유자 지정 요청 / 회수(리소스 종료 집행) / 예외 승인.
 *  발견 목록에만 있던 클라우드 리소스를 태그·소유·통제 관점의 거버넌스 조치로 닫는다(채널 04·06 산출 조치와 동형). 보안담당·Admin. */
export async function respondToCloudFinding(cldId: string, kind: '태그' | '회수' | '예외 승인') {
  const session = await getSession()
  if (!session) return { ok: false, message: '클라우드 리소스 조치 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '클라우드 리소스 조치 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '클라우드 리소스 조치 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const c = s.cloudFindings.find((x) => x.id === cldId)
  if (!c) return { ok: false, message: '클라우드 리소스 검출 항목을 찾을 수 없습니다.' }
  if (c.action) return { ok: false, message: `이미 ${c.action} 처리된 항목입니다.` }

  c.actedBy = session.name
  c.actedAt = today()
  if (kind === '태그') {
    c.action = '태그·소유자 지정 요청'
    dispatch({ channel: '이메일', to: c.dept, subject: `클라우드 리소스 태그·소유자 지정 요청 — ${c.resource} (${c.provider}, ${c.kind})`, kind: '위협 대응', ref: c.id })
    appendAudit({ actor: session.name, action: `클라우드 리소스 태그·소유자 지정 요청 (${c.kind}) — ${c.resource}`, target: c.id })
  } else if (kind === '회수') {
    c.action = '회수 요청'
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `클라우드 리소스 회수(종료) 집행 요청 — ${c.resource} (${c.provider}·${c.account}, ${c.kind})`, kind: '위협 대응', ref: c.id })
    appendAudit({ actor: session.name, action: `클라우드 리소스 회수 요청 (${c.kind}) — ${c.resource}`, target: c.id })
  } else {
    c.action = '예외 승인'
    dispatch({ channel: '이메일', to: c.dept, subject: `클라우드 리소스 예외 승인 — ${c.resource} (${c.account}) 업무용 등록 인정`, kind: '위협 대응', ref: c.id })
    appendAudit({ actor: session.name, action: `클라우드 리소스 예외 승인 (${c.kind}) — ${c.resource}`, target: c.id })
  }
  revalidatePath('/', 'layout')
  const to = kind === '회수' ? '보안운영팀' : c.dept
  return { ok: true, message: `${c.resource} ${c.action} — ${to} 통지·감사 적재` }
}

/** 클라우드 리소스 예외 승인 해제 — USB·VM 예외 해제와 같은 규약. '예외 승인' 상태만 대상. 보안담당·Admin. */
export async function revokeCloudException(cldId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '클라우드 리소스 예외 해제 권한이 없습니다 (보안담당·Admin).' }
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '클라우드 리소스 예외 해제 권한이 없습니다 (보안담당·Admin).', '/discovery/found')
  if (!can('발견 자산 · CMDB 대사', '격리요청', session.role)) return denied(session.name, '클라우드 리소스 예외 해제 권한이 없습니다 (권한 · 정책의 격리요청 권한).', '/discovery/found')
  const s = getStore()
  const c = s.cloudFindings.find((x) => x.id === cldId)
  if (!c) return { ok: false, message: '클라우드 리소스 검출 항목을 찾을 수 없습니다.' }
  if (c.action !== '예외 승인') return { ok: false, message: '예외 승인 상태의 클라우드 리소스만 해제할 수 있습니다.' }
  c.action = undefined
  c.actedBy = undefined
  c.actedAt = undefined
  appendAudit({ actor: session.name, action: `클라우드 리소스 예외 승인 해제 — ${c.resource} (다시 정책 대상)`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.resource} 예외 승인 해제 — 다시 미조치(태그·회수/예외 판정) 대상으로 전환` }
}
