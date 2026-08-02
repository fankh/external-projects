'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { raiseLicenseApproval } from '@/lib/license'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import { EXPIRY_WINDOW_DAYS } from '@/lib/types'

/** 계약 등록 — 신규 구매·유지보수 계약을 대장에 편입한다 (갱신·알림만 있고 등록 경로 부재).
 *  등록 즉시 만료 임박 집계·알림 대상이 된다. 자산담당·Admin. */
export async function addContract(input: {
  kind: '구매' | '유지보수'; name: string; vendor: string; start: string; end: string; amount: number; ownerDept: string
}) {
  const session = await guard()
  if (!session) return { ok: false, message: '계약 등록 권한이 없습니다 (자산담당·Admin).' }

  const name = input.name.trim()
  const vendor = input.vendor.trim()
  const ownerDept = input.ownerDept.trim()
  if (!name || !vendor || !ownerDept) return { ok: false, message: '계약명·공급사·주관부서를 입력하세요.' }
  if (!['구매', '유지보수'].includes(input.kind)) return { ok: false, message: '계약 구분이 올바르지 않습니다.' }
  const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (!dateOk(input.start) || !dateOk(input.end)) return { ok: false, message: '시작일·만료일을 YYYY-MM-DD 로 입력하세요.' }
  if (input.end < input.start) return { ok: false, message: '만료일이 시작일보다 빠릅니다.' }
  if (!Number.isFinite(input.amount) || input.amount < 0) return { ok: false, message: '계약 금액을 0 이상으로 입력하세요.' }

  const s = getStore()
  const id = nextId('CT')
  s.contracts.push({ id, kind: input.kind, name, vendor, start: input.start, end: input.end, amount: Math.round(input.amount), assetCount: 0, ownerDept })

  appendAudit({ actor: session.name, action: `계약 등록 (${input.kind}) — ${name}`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${name} 계약 등록 완료 (${input.kind})` }
}

/** SW 라이선스 등록 — 신규 구매 라이선스를 대사 대상에 편입한다 (그동안 시드만 있고 등록 경로 부재).
 *  사용(used)은 0에서 시작하고, 이후 SW 인벤토리 대사로 채워진다. 자산담당·Admin. */
export async function addLicense(input: { name: string; vendor: string; purchased: number; expiry: string; unitCost: number }) {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 등록 권한이 없습니다 (자산담당·Admin).' }

  const name = input.name.trim()
  const vendor = input.vendor.trim()
  if (!name || !vendor) return { ok: false, message: '라이선스명과 공급사를 입력하세요.' }
  if (!Number.isInteger(input.purchased) || input.purchased <= 0) return { ok: false, message: '보유 좌석 수를 1 이상 입력하세요.' }
  if (input.expiry !== '-' && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry)) return { ok: false, message: '만료일을 YYYY-MM-DD 또는 -(영구)로 입력하세요.' }
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) return { ok: false, message: '단가를 0 이상으로 입력하세요.' }

  const s = getStore()
  if (s.licenses.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `이미 등록된 라이선스입니다 — ${name}` }
  }
  const id = nextId('LIC')
  s.licenses.push({ id, name, vendor, purchased: input.purchased, used: 0, expiry: input.expiry, unitCost: Math.round(input.unitCost) })

  appendAudit({ actor: session.name, action: `SW 라이선스 등록 — ${name} (보유 ${input.purchased}석)`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${name} 라이선스 등록 완료 (보유 ${input.purchased}석)` }
}

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
    if (c.status === '해지' || !due(c.end) || sentToday.has(c.id)) continue
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
  if (c.status === '해지') return { ok: false, message: '해지된 계약은 갱신할 수 없습니다.' }

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

/** 계약 해지 — 공급사 교체·서비스 중단 등으로 만료 전에 계약을 조기 종료한다.
 *  (그동안 계약은 등록·갱신·만료뿐이고 조기 종료 경로가 없어, 해지된 계약도 만료 임박 알림을 계속 울렸다.)
 *  해지하면 만료 임박 집계·알림에서 빠지고 갱신도 막힌다. 주관부서·공급사에 해지 통보를 남긴다. 자산담당·Admin. */
export async function terminateContract(id: string, rawReason: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '계약 해지 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === id)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
  if (c.status === '해지') return { ok: false, message: '이미 해지된 계약입니다.' }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '해지 사유를 입력해 주세요.' }

  c.status = '해지'
  c.terminatedAt = today()

  dispatch({ channel: '이메일', to: c.ownerDept, subject: `${c.id} ${c.name} 계약 해지 — ${reason} (공급사 ${c.vendor})`, kind: '계약 해지', ref: c.id })
  appendAudit({ actor: session.name, action: `계약 해지 — ${c.name} · ${reason}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} ${c.name} 해지 완료 — 만료 임박 집계·알림에서 제외` }
}

/** 라이선스 조치 — 컴플라이언스 4단계의 마지막.
 *  초과 사용은 추가 구매 품의(결재), 미사용 보유는 회수 대상 지정으로 이어진다.
 *  (제품안내서 §03 STEP 4: 조치 — 추가 구매 품의 · 회수) */
export async function actOnLicense(licenseId: string, kind: '추가 구매' | '회수') {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 조치 권한이 없습니다.' }

  const r = raiseLicenseApproval(session, licenseId, kind)
  if (r.ok) revalidatePath('/', 'layout')
  return { ok: r.ok, message: r.message }
}
