'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, fmtAmount, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { buildMaintenance } from '@/lib/maintenance'
import { buildProcurement } from '@/lib/procurement'
import { raiseLicenseApproval } from '@/lib/license'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import { CONTRACT_DOC_TYPES, type ContractDocType } from '@/lib/types'

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

/** 사용 수집 — EDR 설치 SW 인벤토리 대사(§03 라이선스 STEP2). 설치 관측(swInstalls)을 다시 읽어
 *  각 라이선스의 수집 시각을 갱신하고 배정 좌석과의 대사(배정 밖 설치·미설치 좌석)를 최신화한다.
 *  used(집계 탐지량)는 유지하고, 좌석 단위 정합만 재수집한다. 자산담당·Admin. */
export async function collectLicenseUsage() {
  const session = await guard()
  if (!session) return { ok: false, message: '사용 수집 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const installs = s.swInstalls ?? []
  let touched = 0
  for (const l of s.licenses) {
    if (l.status === '해지') continue
    const inScope = (l.seats?.length ?? 0) > 0 || installs.some((i) => i.licenseId === l.id)
    if (!inScope) continue
    l.usageCollectedAt = today()
    touched++
  }
  appendAudit({ actor: session.name, action: `라이선스 사용 수집 — EDR 설치 SW 인벤토리 대사 (설치 관측 ${installs.length}건 · ${touched}개 라이선스)`, target: '라이선스' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `사용 수집 완료 — 설치 관측 ${installs.length}건 · ${touched}개 라이선스 대사` }
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
  const windowDays = s.opsPolicy.expiryWindowDays
  const due = (end: string) => {
    const d = daysUntil(end)
    return d !== null && d <= windowDays
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
    if (l.status === '해지' || l.expiry === '-' || !due(l.expiry) || sentToday.has(l.id)) continue
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

  if (n === 0) return { ok: false, message: `${windowDays}일 내 신규 알림 대상이 없습니다 (오늘 발송분 제외).` }
  appendAudit({ actor: session.name, action: `만료 임박 알림 발송 (${n}건)`, target: '계약 · 라이선스' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `만료 임박 알림 ${n}건 발송 — 연동 · 인프라의 발송 이력에서 확인할 수 있습니다.` }
}

/** 유지보수 예산 통보 — 예산 초과·소진 임박 유지보수 계약의 주관부서·공급사에 재협상·집행 점검을 요청한다.
 *  (제품안내서 §03 유지보수 계약: 비용 이력·예산 관리 — 그동안 집행률 판정은 화면·대시보드에 보였으나 조치 채널이 없었다.
 *   대여 독촉·만료 임박 알림처럼 신호에 실제 통보 채널을 붙인다.) 예산 초과는 추가 예산·재협상, 소진 임박은 잔여 집행 계획 점검.
 *  당일 이미 통보한 계약은 건너뛴다(ref = 계약 id). 자산담당·Admin. */
export async function notifyMaintenanceBudget() {
  const session = await guard()
  if (!session) return { ok: false, message: '유지보수 예산 통보 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const t = today()
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '유지보수 예산 통보' && m.at.startsWith(t)).map((m) => m.ref),
  )

  let n = 0
  for (const r of buildMaintenance().rows) {
    if (r.status !== '예산 초과' && r.status !== '소진 임박') continue
    if (sentToday.has(r.id)) continue
    const ask = r.status === '예산 초과' ? '추가 예산·재협상 검토' : '잔여 집행 계획 점검'
    dispatch({
      channel: '이메일',
      to: `${r.ownerDept} · ${r.vendor}`,
      subject: `${r.id} ${r.name} 유지보수 예산 ${r.status} (집행률 ${r.rate}% · 잔여 ${fmtAmount(r.remaining)}원) — ${ask} 요청`,
      kind: '유지보수 예산 통보',
      ref: r.id,
    })
    n += 1
  }

  if (n === 0) return { ok: false, message: '예산 초과·소진 임박 유지보수 계약이 없습니다 (오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `유지보수 예산 통보 발송 (${n}건)`, target: '유지보수 계약' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `유지보수 예산 통보 ${n}건 발송 — 주관부서·공급사에 재협상·집행 점검 요청 (발송 이력 적재)` }
}

/** 발주 이행 독촉 — 발주가 소화되지 않은 채(발주율 저조) 계약 만료가 임박한 구매 계약의 주관부서·공급사에 발주·검수 이행을 재촉한다.
 *  (그동안 발주 미이행 위험은 화면·대시보드에 판정만 보이고 조치 채널이 없었다 — 유지보수 예산 통보·대여 독촉과 같은 신호→조치.)
 *  만료 전에 발주를 소화하지 못하면 예산 실기·정산 지연이 되므로, 잔여 발주 여력·D-day 를 담아 통보한다. 당일 중복 발송 방지(ref=계약 id). 자산담당·Admin. */
export async function remindProcurement() {
  const session = await guard()
  if (!session) return { ok: false, message: '발주 이행 독촉 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const t = today()
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '발주 이행 독촉' && m.at.startsWith(t)).map((m) => m.ref),
  )

  let n = 0
  for (const r of buildProcurement().atRisk) {
    if (sentToday.has(r.id)) continue
    dispatch({
      channel: '이메일',
      to: `${r.ownerDept} · ${r.vendor} · 구매팀`,
      subject: `${r.id} ${r.name} 발주 미이행 — 발주율 ${r.rate}% · 잔여 발주 ${fmtAmount(r.remaining)}원 · 만료 ${r.end}(D-${r.dday}) 전 발주·검수 이행 요청`,
      kind: '발주 이행 독촉',
      ref: r.id,
    })
    n += 1
  }

  if (n === 0) return { ok: false, message: '발주 미이행 위험 계약이 없습니다 (오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `발주 이행 독촉 발송 (${n}건)`, target: '구매 계약' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `발주 이행 독촉 ${n}건 발송 — 주관부서·공급사·구매팀에 만료 전 발주·검수 이행 요청 (발송 이력 적재)` }
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
  // 갱신 이력을 계약에 남긴다 — 전역 감사 로그만으론 계약별 기간 변천을 추적하기 어렵다(등록→갱신×N→만료/해지)
  ;(c.renewals ??= []).push({ date: today(), from: oldEnd, to: newEnd, termYears, by: session.name })

  appendAudit({ actor: session.name, action: `계약 갱신 (${termYears}년) — ${c.name}: ${oldEnd} → ${newEnd}`, target: c.id })
  dispatch({ channel: '이메일', to: c.ownerDept, subject: `${c.id} ${c.name} 계약 갱신 완료 — 만료일 ${newEnd} (${termYears}년 연장)`, kind: '만료 임박', ref: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} ${c.name} 갱신 완료 — 만료일 ${oldEnd} → ${newEnd} (${termYears}년)` }
}

/** 라이선스 갱신 — 구독 라이선스의 만료일을 연장한다(계약 갱신과 동형). 영구(-) 라이선스는 대상 아님.
 *  갱신 이력을 라이선스에 남겨 구독 기간 변천을 추적한다. 자산담당·Admin. */
export async function renewLicense(id: string, termYears: number) {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 갱신 권한이 없습니다 (자산담당·Admin).' }
  if (![1, 2, 3].includes(termYears)) return { ok: false, message: '갱신 기간은 1·2·3년만 가능합니다.' }

  const s = getStore()
  const l = s.licenses.find((x) => x.id === id)
  if (!l) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }
  if (l.status === '해지') return { ok: false, message: '해지된 라이선스는 갱신할 수 없습니다.' }
  if (l.expiry === '-') return { ok: false, message: '영구 라이선스는 갱신 대상이 아닙니다.' }

  const base = l.expiry >= today() ? l.expiry : today()
  const [y, m, d] = base.split('-')
  const newExpiry = `${Number(y) + termYears}-${m}-${d}`
  const oldExpiry = l.expiry
  l.expiry = newExpiry
  ;(l.renewals ??= []).push({ date: today(), from: oldExpiry, to: newExpiry, termYears, by: session.name })

  appendAudit({ actor: session.name, action: `라이선스 갱신 (${termYears}년) — ${l.name}: ${oldExpiry} → ${newExpiry}`, target: l.id })
  dispatch({ channel: '이메일', to: 'IT기획팀', subject: `${l.name} 라이선스 갱신 완료 — 만료일 ${newExpiry} (${termYears}년 연장)`, kind: '만료 임박', ref: l.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${l.name} 갱신 완료 — 만료일 ${oldExpiry} → ${newExpiry} (${termYears}년)` }
}

/** 라이선스 해지 — 도구 이관·구독 중단으로 더 이상 쓰지 않는 SW 라이선스를 컴플라이언스에서 내린다(계약 해지와 동형).
 *  해지하면 만료 임박 집계·알림·판정에서 빠지고 갱신·조치도 막힌다. IT기획팀에 통보한다. 자산담당·Admin. */
export async function retireLicense(id: string, rawReason: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 해지 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const l = s.licenses.find((x) => x.id === id)
  if (!l) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }
  if (l.status === '해지') return { ok: false, message: '이미 해지된 라이선스입니다.' }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '해지 사유를 입력해 주세요.' }

  l.status = '해지'
  l.terminatedAt = today()

  dispatch({ channel: '이메일', to: 'IT기획팀', subject: `${l.name} 라이선스 해지 — ${reason} (공급사 ${l.vendor})`, kind: '계약 해지', ref: l.id })
  appendAudit({ actor: session.name, action: `라이선스 해지 — ${l.name} · ${reason}`, target: l.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${l.name} 해지 완료 — 만료 임박 집계·알림·판정에서 제외` }
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

  // 연계 영향 — 이 계약을 근거로 한 라이선스(구독)·자산(유지보수 커버리지)이 해지로 영향받는다.
  // 자동 해지/변경은 하지 않되(라이선스는 타 계약 이관 가능·자산은 소유 유지), 담당자가 검토하도록 규모를 드러낸다.
  const linkedLic = s.licenses.filter((l) => l.contractId === id && l.status !== '해지')
  const linkedAssets = s.assets.filter((a) => a.contractId === id && !['폐기완료', '폐기예정'].includes(a.status))
  const impact = [linkedLic.length > 0 ? `라이선스 ${linkedLic.length}건(구독 확인)` : '', linkedAssets.length > 0 ? `자산 ${linkedAssets.length}대(${c.kind === '유지보수' ? '유지보수 커버리지' : '연계'} 확인)` : ''].filter(Boolean).join(' · ')

  dispatch({ channel: '이메일', to: c.ownerDept, subject: `${c.id} ${c.name} 계약 해지 — ${reason} (공급사 ${c.vendor})${impact ? ` · 연계 ${impact}` : ''}`, kind: '계약 해지', ref: c.id })
  appendAudit({ actor: session.name, action: `계약 해지 — ${c.name} · ${reason}${impact ? ` · 연계 영향 ${impact}` : ''}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} ${c.name} 해지 완료 — 만료 임박 집계·알림에서 제외${impact ? `. 연계 ${impact} 검토 필요` : ''}` }
}

/** 계약 부속서류 등록 — 계약서·견적서·세금계산서·보증서 등 근거 문서를 계약에 연결한다.
 *  실제 파일 저장은 범위 밖이므로 문서 메타데이터(이름·유형·등록자·등록일)만 남긴다 —
 *  "어떤 근거 문서가 존재하는가"의 추적이 목적(제품안내서 §03 구매 계약: 부속서류 관리). 자산담당·Admin. */
export async function addContractDoc(contractId: string, rawName: string, docType: ContractDocType) {
  const session = await guard()
  if (!session) return { ok: false, message: '부속서류 등록 권한이 없습니다 (자산담당·Admin).' }

  const name = rawName.trim()
  if (!name) return { ok: false, message: '문서명을 입력하세요.' }
  if (!CONTRACT_DOC_TYPES.includes(docType)) return { ok: false, message: '문서 유형이 올바르지 않습니다.' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
  if (!c.documents) c.documents = []
  if (c.documents.some((d) => d.name === name && d.docType === docType)) {
    return { ok: false, message: `이미 등록된 문서입니다 — ${docType} · ${name}` }
  }
  c.documents.push({ id: nextId('DOC'), name, docType, addedAt: today(), addedBy: session.name })
  appendAudit({ actor: session.name, action: `계약 부속서류 등록 — ${docType} · ${name}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} 부속서류 등록 — ${docType} · ${name}` }
}

/** 계약 부속서류 삭제 — 잘못 등록한 문서 항목을 제거한다. 감사 로그에 남긴다. 자산담당·Admin. */
export async function removeContractDoc(contractId: string, docId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '부속서류 삭제 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c || !c.documents) return { ok: false, message: '계약 또는 문서를 찾을 수 없습니다.' }
  const doc = c.documents.find((d) => d.id === docId)
  if (!doc) return { ok: false, message: '문서를 찾을 수 없습니다.' }
  c.documents = c.documents.filter((d) => d.id !== docId)
  appendAudit({ actor: session.name, action: `계약 부속서류 삭제 — ${doc.docType} · ${doc.name}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} 부속서류 삭제 — ${doc.name}` }
}

/** 유지보수 SLA 설정 — 유지보수 계약의 서비스 수준 협약(장애 대응·가동률 등)을 기록한다.
 *  (제품안내서 §03 유지보수 계약: 대상 자산·범위·SLA 관리) 유지보수 계약만 대상. 자산담당·Admin. */
export async function setContractSla(contractId: string, rawSla: string) {
  const session = await guard()
  if (!session) return { ok: false, message: 'SLA 설정 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
  if (c.kind !== '유지보수') return { ok: false, message: 'SLA 는 유지보수 계약에만 설정할 수 있습니다.' }
  c.sla = rawSla.trim() || undefined
  appendAudit({ actor: session.name, action: `유지보수 SLA ${c.sla ? '설정' : '삭제'}${c.sla ? ` — ${c.sla}` : ''}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} SLA ${c.sla ? '저장' : '삭제'} 완료` }
}

/** 유지보수 비용 등록 — 정기·수시 유지보수 지출을 계약 비용 이력에 추가한다.
 *  (제품안내서 §03 유지보수 계약: 비용 이력) 유지보수 계약만 대상. 자산담당·Admin. */
export async function addContractCost(contractId: string, date: string, rawItem: string, amount: number) {
  const session = await guard()
  if (!session) return { ok: false, message: '비용 등록 권한이 없습니다 (자산담당·Admin).' }

  const item = rawItem.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: '지출일을 YYYY-MM-DD 로 입력하세요.' }
  if (!item) return { ok: false, message: '비용 항목을 입력하세요.' }
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: '금액을 0 이상으로 입력하세요.' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
  if (c.kind !== '유지보수') return { ok: false, message: '비용 이력은 유지보수 계약에만 등록할 수 있습니다.' }
  if (!c.costs) c.costs = []
  c.costs.push({ id: nextId('CST'), date, item, amount, addedBy: session.name })
  appendAudit({ actor: session.name, action: `유지보수 비용 등록 — ${date} ${item} ${amount.toLocaleString()}원`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} 비용 등록 — ${item} ${amount.toLocaleString()}원` }
}

/** 유지보수 비용 삭제 — 잘못 등록한 비용 항목을 제거한다. 감사 로그에 남긴다. 자산담당·Admin. */
export async function removeContractCost(contractId: string, costId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '비용 삭제 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c || !c.costs) return { ok: false, message: '계약 또는 비용 항목을 찾을 수 없습니다.' }
  const cost = c.costs.find((x) => x.id === costId)
  if (!cost) return { ok: false, message: '비용 항목을 찾을 수 없습니다.' }
  c.costs = c.costs.filter((x) => x.id !== costId)
  appendAudit({ actor: session.name, action: `유지보수 비용 삭제 — ${cost.date} ${cost.item}`, target: c.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${c.id} 비용 삭제 — ${cost.item}` }
}

/** 라이선스 조치 — 컴플라이언스 4단계의 마지막.
 *  초과 사용은 추가 구매 품의(결재), 미사용 보유는 회수 대상 지정으로 이어진다.
 *  (제품안내서 §03 STEP 4: 조치 — 추가 구매 품의 · 회수) */
export async function actOnLicense(licenseId: string, kind: '추가 구매' | '회수') {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 조치 권한이 없습니다.' }
  if (getStore().licenses.find((l) => l.id === licenseId)?.status === '해지') return { ok: false, message: '해지된 라이선스는 조치할 수 없습니다.' }

  const r = raiseLicenseApproval(session, licenseId, kind)
  if (r.ok) revalidatePath('/', 'layout')
  return { ok: r.ok, message: r.message }
}

/** 라이선스 좌석 배정 — 라이선스 한 석을 특정 자산(과 그 보유자·부서)에 배정한다.
 *  보유·사용 수량만으로는 '누가 어느 석을 쓰는지' 증명이 안 돼 SAM 감사에서 배정 대장을 요구한다.
 *  배정 수는 보유(purchased)를 넘을 수 없고, 같은 자산 중복 배정은 막는다. 자산담당·Admin. */
export async function assignLicenseSeat(licenseId: string, rawAssetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 좌석 배정 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const lic = s.licenses.find((l) => l.id === licenseId)
  if (!lic) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }
  if (lic.status === '해지') return { ok: false, message: '해지된 라이선스는 좌석을 배정할 수 없습니다.' }
  const assetNo = rawAssetNo.trim().toUpperCase()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: `자산을 찾을 수 없습니다 — ${assetNo}` }
  // 종료(터미널) 상태 자산에는 좌석을 배정할 수 없다 — 좌석 자동 회수(reclaimLicenseSeats)는 이탈 '시점'에만 돌므로,
  // 이미 분실·폐기 확정된 자산에 새로 배정하면 회수 트리거가 다시 돌지 않아 좌석이 영구히 물려 보유 초과·사용량 과대·SAM 배정 대장 오기록으로 샌다(로56 좌석 생애주기 무결성).
  // (폐기예정은 recordWipe 시, 반납대기는 반납 접수 시 좌석을 회수하므로 영구 누수가 아니다 — 종료 확정 상태만 막는다.)
  if (['분실', '폐기완료'].includes(asset.status)) {
    return { ok: false, message: `종료 상태(${asset.status}) 자산에는 좌석을 배정할 수 없습니다 — ${assetNo} (좌석 누수 방지).` }
  }
  lic.seats ??= []
  if (lic.seats.some((x) => x.assetNo === assetNo)) return { ok: false, message: `이미 이 라이선스가 배정된 자산입니다 — ${assetNo}` }
  if (lic.seats.length >= lic.purchased) return { ok: false, message: `보유 좌석(${lic.purchased}석)을 초과할 수 없습니다 — 추가 구매 후 배정하세요.` }
  lic.seats.push({ assetNo, user: asset.owner, dept: asset.dept, at: today() })
  // 사용량(used) 정합 — 관리 좌석 수보다 실제 사용이 적을 수 없다(배정 = 소비). UI 로 신규 등록한 라이선스(used 시드 없음)가
  // 좌석 배정 후에도 used=0 으로 남아 컴플라이언스에서 '미사용 보유'로 오분류되고 절감액이 과대계상되던 문제 방지
  // (집계 used 가 좌석 수보다 크면 그대로 둔다 — used 는 좌석보다 넓은 전사 소비 집계이므로 하한만 맞춘다).
  if (lic.seats.length > lic.used) lic.used = lic.seats.length
  appendAudit({ actor: session.name, action: `라이선스 좌석 배정 — ${lic.name} → ${assetNo} (${asset.owner})`, target: licenseId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lic.name} 좌석을 ${assetNo}(${asset.owner})에 배정 — 배정 ${lic.seats.length}/${lic.purchased}석` }
}

/** 라이선스 배정 밖 설치 제거 요청 — 좌석 배정 없이 설치된 무단 사용(SAM 리스크)을 좌석 배정(구매·합법화)이 아니라
 *  제거로 닫는다. 그동안 배정 밖 설치는 '좌석 배정'만 가능해, 애초에 있어선 안 될 설치를 지우는 길이 없었다.
 *  (미인가 SW 제거 요청(로47)의 라이선스판 — 합법화 아니면 제거, 둘 다 컴플라이언스 종결 경로.)
 *  해당 자산의 소유 부서에 제거를 요청하고 감사·발송 이력을 남긴다. 실제 소거는 다음 사용량 대사에서 반영된다.
 *  당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function requestOffSeatRemoval(licenseId: string, rawAssetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '설치 제거 요청 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const lic = s.licenses.find((l) => l.id === licenseId)
  if (!lic) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }
  const assetNo = rawAssetNo.trim().toUpperCase()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  const dept = asset?.dept ?? '자산관리팀'
  const owner = asset?.owner ?? '-'
  const t = today()
  const ref = `${licenseId}:${assetNo}`
  if (s.dispatches.some((m) => m.kind === '라이선스 제거 요청' && m.ref === ref && m.at.startsWith(t))) {
    return { ok: false, message: `오늘 이미 제거를 요청했습니다 — ${lic.name} @ ${assetNo}` }
  }
  dispatch({ channel: '이메일', to: `${owner} (${dept})`, subject: `라이선스 배정 밖 설치 제거 요청 — ${lic.name} @ ${assetNo}, 좌석 미배정 무단 사용(제거 또는 좌석 신청 요망)`, kind: '라이선스 제거 요청', ref })
  appendAudit({ actor: session.name, action: `라이선스 배정 밖 설치 제거 요청 — ${lic.name} @ ${assetNo} (${owner}·${dept})`, target: licenseId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lic.name} 배정 밖 설치 제거 요청 — ${assetNo}(${owner}·${dept}) 소유 부서 통지·감사 적재 (다음 사용량 대사에서 반영)` }
}

/** 라이선스 좌석 회수(배정 해제) — 배정된 석을 대장에서 제거한다(재배정·오프보딩). 자산담당·Admin. */
export async function unassignLicenseSeat(licenseId: string, assetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '라이선스 좌석 회수 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const lic = s.licenses.find((l) => l.id === licenseId)
  if (!lic || !lic.seats) return { ok: false, message: '배정 좌석을 찾을 수 없습니다.' }
  const before = lic.seats.length
  lic.seats = lic.seats.filter((x) => x.assetNo !== assetNo)
  if (lic.seats.length === before) return { ok: false, message: `배정되지 않은 자산입니다 — ${assetNo}` }
  appendAudit({ actor: session.name, action: `라이선스 좌석 회수 — ${lic.name} ← ${assetNo}`, target: licenseId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lic.name} 좌석 회수 — ${assetNo} 배정 해제 (배정 ${lic.seats.length}/${lic.purchased}석)` }
}
