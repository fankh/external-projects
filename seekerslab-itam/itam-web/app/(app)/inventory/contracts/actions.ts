'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId } from '@/lib/store'
import { EXPIRY_WINDOW_DAYS } from '@/lib/types'

async function guard() {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) return null
  return session
}

/** 만료 임박 알림 발송 — 계약·보증·라이선스를 한 번에 훑어 주관부서 앞으로 통지한다.
 *  (제품안내서 §03: 계약·보증·라이선스 만료 임박 자동 메일)
 *  같은 대상에 오늘 이미 보냈으면 다시 보내지 않는다 — 알림 피로가 알림을 무력화한다. */
export async function sendExpiryNotices() {
  const session = await guard()
  if (!session) return { ok: false, message: '알림 발송 권한이 없습니다.' }

  const s = getStore()
  const t = today()
  const due = (end: string) => {
    const d = daysUntil(end)
    return d !== null && d <= EXPIRY_WINDOW_DAYS
  }
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '만료 임박' && m.at.startsWith(t)).map((m) => m.ref),
  )

  let n = 0
  for (const c of s.contracts) {
    if (!due(c.end) || sentToday.has(c.id)) continue
    const d = daysUntil(c.end)!
    dispatch({
      channel: '이메일',
      to: c.ownerDept,
      subject: `${c.id} ${c.name} ${d < 0 ? `만료 경과 (${-d}일)` : `만료 임박 (D-${d})`} — 갱신 검토 요청`,
      kind: '만료 임박',
      ref: c.id,
    })
    n += 1
  }
  for (const l of s.licenses) {
    if (l.expiry === '-' || !due(l.expiry) || sentToday.has(l.id)) continue
    const d = daysUntil(l.expiry)!
    dispatch({
      channel: '이메일',
      to: 'IT기획팀',
      subject: `${l.name} 라이선스 ${d < 0 ? '만료 경과' : `만료 임박 (D-${d})`} — 보유 ${l.purchased} / 사용 ${l.used}`,
      kind: '만료 임박',
      ref: l.id,
    })
    n += 1
  }
  // 보증 만료는 자산 단위 — 부서별로 묶어 한 통씩 보낸다 (자산마다 메일을 보내면 아무도 읽지 않는다)
  const byDept = new Map<string, number>()
  for (const a of s.assets) {
    if (a.warrantyEnd === '-' || ['폐기완료', '폐기예정'].includes(a.status)) continue
    if (!due(a.warrantyEnd)) continue
    byDept.set(a.dept, (byDept.get(a.dept) ?? 0) + 1)
  }
  for (const [dept, count] of byDept) {
    const ref = `WRT-${dept}`
    if (sentToday.has(ref)) continue
    dispatch({ channel: '이메일', to: dept, subject: `보증 만료 임박 자산 ${count}건 — 연장·교체 검토 요청`, kind: '만료 임박', ref })
    n += 1
  }

  if (n === 0) return { ok: false, message: `${EXPIRY_WINDOW_DAYS}일 내 신규 알림 대상이 없습니다 (오늘 발송분 제외).` }
  appendAudit({ actor: session.name, action: `만료 임박 알림 발송 (${n}건)`, target: '계약 · 라이선스' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `만료 임박 알림 ${n}건 발송 — 연동 · 인프라의 발송 이력에서 확인할 수 있습니다.` }
}

/** 계약 갱신 — 만료 임박·경과 계약의 계약 기간을 연장한다.
 *  (제품안내서 §03: 계약·유지보수 만료·갱신 — 알림만 있고 갱신 처리가 없던 공백)
 *  만료일을 연장하면 만료 임박 집계에서 빠진다(폐쇄 루프). 기존 만료일이 지났으면 오늘을 기준으로 연장한다. */
export async function renewContract(id: string, termYears: number) {
  const session = await guard()
  if (!session) return { ok: false, message: '계약 갱신 권한이 없습니다 (자산담당·Admin).' }
  if (![1, 2, 3].includes(termYears)) return { ok: false, message: '갱신 기간은 1·2·3년만 가능합니다.' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === id)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }

  // 기준일: 만료 전이면 만료일 기준(주기 승계), 이미 지났으면 오늘 기준. 문자열 비교로 TZ 문제를 피한다.
  const base = c.end >= today() ? c.end : today()
  const [y, m, d] = base.split('-')
  const newEnd = `${Number(y) + termYears}-${m}-${d}`
  const oldEnd = c.end
  c.end = newEnd

  appendAudit({ actor: session.name, action: `계약 갱신 (${termYears}년) — ${c.name}: ${oldEnd} → ${newEnd}`, target: c.id })
  dispatch({ channel: '이메일', to: c.ownerDept, subject: `${c.id} ${c.name} 계약 갱신 완료 — 만료일 ${newEnd} (${termYears}년 연장)`, kind: '만료 임박', ref: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} ${c.name} 갱신 완료 — 만료일 ${oldEnd} → ${newEnd} (${termYears}년)` }
}

/** 라이선스 조치 — 컴플라이언스 4단계의 마지막.
 *  초과 사용은 추가 구매 품의(결재), 미사용 보유는 회수 대상 지정으로 이어진다.
 *  (제품안내서 §03 STEP 4: 조치 — 추가 구매 품의 · 회수) */
export async function actOnLicense(licenseId: string, kind: '추가 구매' | '회수') {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 조치 권한이 없습니다.' }

  const s = getStore()
  const l = s.licenses.find((x) => x.id === licenseId)
  if (!l) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }

  const gap = l.used - l.purchased
  if (kind === '추가 구매' && gap <= 0) return { ok: false, message: `초과 사용 상태가 아닙니다 — ${l.name}` }
  if (kind === '회수' && gap >= 0) return { ok: false, message: `회수할 여유 석이 없습니다 — ${l.name}` }

  const dup = s.approvals.find((a) => a.status === '대기' && a.refId === l.id)
  if (dup) return { ok: false, message: `이미 결재 대기 중인 조치가 있습니다 — ${dup.id}` }

  const seats = Math.abs(gap)
  const cost = seats * l.unitCost
  const id = nextApprovalId()
  s.approvals.unshift({
    id,
    kind: '자산 신청',
    title:
      kind === '추가 구매'
        ? `${l.name} 라이선스 ${seats}석 추가 구매 품의 — 초과 사용 해소 (약 ${cost.toLocaleString()}원)`
        : `${l.name} 라이선스 ${seats}석 회수 — 장기 미사용 (연 약 ${cost.toLocaleString()}원 절감)`,
    requester: session.name,
    dept: 'IT기획팀',
    requestedAt: today(),
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: l.id,
    note: `보유 ${l.purchased} / 사용 ${l.used} · 단가 ${l.unitCost.toLocaleString()}원`,
  })

  appendAudit({ actor: session.name, action: `라이선스 ${kind} 상신 (${seats}석)`, target: l.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 상신 — ${l.name} ${seats}석 ${kind}` }
}
