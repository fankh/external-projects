'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId } from '@/lib/store'
import { CONFIRM_DEADLINE_DAYS } from '@/lib/types'

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

/** 발견 자산 편입 요청 — 소유자 확인 → 자산 등록 결재를 통과해야 대장에 편입 (편입도 결재로) */
export async function requestOnboard(discoveredId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
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
  revalidatePath('/', 'layout')
}

/** NAC 격리 요청 — 미확인·미인가 자산 차단 (발견과 조치의 양방향 폐쇄 루프) */
export async function requestQuarantine(discoveredId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
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
  revalidatePath('/', 'layout')
}
