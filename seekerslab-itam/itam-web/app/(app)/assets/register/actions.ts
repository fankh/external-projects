'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch, escalate } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextAssetNo } from '@/lib/store'
import type { Asset, AssetCategory, BizCriticality } from '@/lib/types'

const CRITICALITY_LEVELS: BizCriticality[] = ['핵심', '중요', '일반']

/** 업무 중요도 지정 — 자산이 담당하는 업무의 중요도를 운영자가 설정한다(제품안내서 §05 취약점 우선순위의 '자산 중요도' 축).
 *  취약점 노출 우선순위 스코어링에 반영되어, 같은 취약점이라도 핵심 자산일수록 조치 우선순위가 높아진다. 자산담당·Admin. */
export async function setAssetCriticality(assetNo: string, level: BizCriticality) {
  const session = await guard()
  if (!session) return { ok: false, message: '업무 중요도 지정 권한이 없습니다 (자산담당·Admin).' }
  if (!CRITICALITY_LEVELS.includes(level)) return { ok: false, message: '업무 중요도 값이 올바르지 않습니다.' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }

  const before = asset.criticality ?? '일반'
  if (before === level) return { ok: false, message: `이미 업무 중요도 '${level}'로 지정돼 있습니다.` }
  asset.criticality = level
  asset.history.push({ date: today(), kind: '구성변경', detail: `업무 중요도 ${before} → ${level}`, actor: session.name })
  appendAudit({ actor: session.name, action: `업무 중요도 변경 — ${asset.assetNo}: ${before} → ${level}`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 업무 중요도 '${level}' 지정 — 취약점 우선순위 스코어링에 반영` }
}

/** 자산–계약 연계 (제품안내서 §03 구매 계약: 계약–자산 연결) — 자산을 구매·유지보수 계약에 연결하거나 해제한다.
 *  계약의 '연계 자산' 수(contractAssetCount 파생)에 즉시 반영된다. 해지된 계약에는 연계할 수 없다. 자산담당·Admin. */
export async function setAssetContract(assetNo: string, rawContractId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '계약 연계 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  const contractId = rawContractId.trim()
  const before = asset.contractId ?? '(없음)'

  if (contractId) {
    const c = s.contracts.find((x) => x.id === contractId)
    if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
    if (c.status === '해지') return { ok: false, message: '해지된 계약에는 연계할 수 없습니다.' }
    if (asset.contractId === contractId) return { ok: false, message: `이미 ${contractId} 에 연계돼 있습니다.` }
    asset.contractId = contractId
    asset.history.push({ date: today(), kind: '구성변경', detail: `계약 연계 ${before} → ${contractId} (${c.name})`, actor: session.name })
    appendAudit({ actor: session.name, action: `자산–계약 연계 — ${assetNo}: ${before} → ${contractId}`, target: assetNo })
    revalidatePath('/', 'layout')
    return { ok: true, message: `${assetNo} → ${contractId} (${c.name}) 계약 연계 완료` }
  }

  if (!asset.contractId) return { ok: false, message: '연계된 계약이 없습니다.' }
  asset.history.push({ date: today(), kind: '구성변경', detail: `계약 연계 해제 (${before})`, actor: session.name })
  appendAudit({ actor: session.name, action: `자산–계약 연계 해제 — ${assetNo}: ${before}`, target: assetNo })
  asset.contractId = undefined
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 계약 연계 해제 완료` }
}

const IMPORT_CATS: AssetCategory[] = ['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']

async function guard() {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) return null
  return session
}

/** 구성변경 대상 — 자산 유형(재분류) + 대장이 보유한 사양 필드(CPU·메모리·OS·IP·MAC) + 사양 외 기타 변경 (제품안내서 §03 구성정보). */
export type ConfigField = '유형' | 'os' | 'cpu' | 'memory' | 'ip' | 'mac' | '기타'
const FIELD_LABEL: Record<ConfigField, string> = { 유형: '유형', os: 'OS', cpu: 'CPU', memory: '메모리', ip: 'IP', mac: 'MAC', 기타: '기타' }

/** 구성변경 기록 — 자산의 사양 변경(메모리 증설·OS 재설치 등)을 대장에 반영하고
 *  변경 이력 타임라인에 '구성변경' 이벤트로 남긴다. (제품안내서 §03 — 등록·이동·구성변경·점검·폐기 단일 화면 추적)
 *  코드 자체가 아니라 사양 필드만 바꾼다. 사양 외 변경은 '기타'로 사유만 기록한다. */
export async function recordConfigChange(assetNo: string, field: ConfigField, rawValue: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '구성변경 기록 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }

  const value = rawValue.trim()
  const note = rawNote.trim()
  let detail: string

  if (field === '유형') {
    // 유형 재분류 — AI 자동분류 오분류 정정·용도 변경(제안→담당자 확인·정정, §05 제안 환류). 유효 유형만 허용.
    if (!IMPORT_CATS.includes(value as AssetCategory)) return { ok: false, message: '올바른 자산 유형을 선택하세요.' }
    const before = asset.category
    if (before === value && !note) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
    asset.category = value as AssetCategory
    detail = `유형 ${before} → ${value}${note ? ` (${note})` : ''}`
  } else if (field === '기타') {
    if (!note) return { ok: false, message: '기타 구성변경은 변경 내용을 입력하세요.' }
    detail = note
  } else {
    if (!value) return { ok: false, message: `${FIELD_LABEL[field]} 의 새 값을 입력하세요.` }
    const before = asset[field] ?? '(없음)'
    if (before === value && !note) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
    asset[field] = value
    detail = `${FIELD_LABEL[field]} ${before} → ${value}${note ? ` (${note})` : ''}`
  }

  asset.history.push({ date: today(), kind: '구성변경', detail, actor: session.name })
  appendAudit({ actor: session.name, action: `구성변경 — ${detail}`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 구성변경 기록 — ${detail}` }
}

/** 정합성 보정 대상 — 대장 정합성 점검(lib/quality)이 잡는 누락 핵심 필드. */
export type StewardField = '소유자' | '위치' | '시리얼'
const STEWARD_KEY: Record<StewardField, 'owner' | 'location' | 'serial'> = { 소유자: 'owner', 위치: 'location', 시리얼: 'serial' }

/** 정합성 보정 — 누락(공백/'-')된 핵심 필드를 채워 대장-실물 일치를 회복한다(제품안내서 §03 CMDB 정합성).
 *  **누락 필드 채움만** 허용 — 기존 값 변경(실물 이동·소유자 재배정)은 이동·불출 결재를 거쳐야 하므로 여기서 막는다(거버넌스).
 *  데이터 정정 이벤트라 '점검' 이력으로 남기고 감사한다. 자산담당·Admin. */
export async function correctField(assetNo: string, field: StewardField, rawValue: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '정합성 보정 권한이 없습니다 (자산담당·Admin).' }
  const key = STEWARD_KEY[field]
  if (!key) return { ok: false, message: '보정할 필드가 올바르지 않습니다.' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }

  const value = rawValue.trim()
  const note = rawNote.trim()
  if (!value || value === '-') return { ok: false, message: `${field} 의 값을 입력하세요.` }

  const before = (asset[key] ?? '').trim()
  // 이미 값이 있으면 정정이 아니라 변경 — 거버넌스 대상이라 이동·불출 절차로 유도한다.
  if (before && before !== '-') return { ok: false, message: `${field} 은 이미 값이 있습니다 — 실물 변경은 이동·불출 결재로 처리하세요.` }

  asset[key] = value
  const detail = `정합성 보정 — ${field} 항목 입력 → ${value}${note ? ` (${note})` : ''}`
  asset.history.push({ date: today(), kind: '점검', detail, actor: session.name })
  appendAudit({ actor: session.name, action: detail, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} ${detail}` }
}

/** 보증 연장 — 자산의 보증 만료일을 연장한다(연장 보증 계약 등).
 *  (제품안내서 §03 보증기간 관리 — 보증 만료 알림은 "연장·교체 검토 요청"이라 하는데 연장 처리가 없었다)
 *  만료 전이면 만료일 기준, 지났으면 오늘 기준으로 연장. 타임라인에 보증연장 이벤트를 남기고
 *  만료일이 미래로 바뀌면 만료 임박 집계에서 빠진다(폐쇄 루프). */
export async function extendWarranty(assetNo: string, termYears: number) {
  const session = await guard()
  if (!session) return { ok: false, message: '보증 연장 권한이 없습니다 (자산담당·Admin).' }
  if (![1, 2, 3].includes(termYears)) return { ok: false, message: '연장 기간은 1·2·3년만 가능합니다.' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.warrantyEnd === '-') return { ok: false, message: '보증 정보가 없는 자산입니다 (SW·가상자원 등).' }

  const base = asset.warrantyEnd >= today() ? asset.warrantyEnd : today()
  const [y, m, d] = base.split('-')
  const newEnd = `${Number(y) + termYears}-${m}-${d}`
  const oldEnd = asset.warrantyEnd
  asset.warrantyEnd = newEnd

  const detail = `보증 만료 ${oldEnd} → ${newEnd} (${termYears}년 연장)`
  asset.history.push({ date: today(), kind: '보증연장', detail, actor: session.name })
  appendAudit({ actor: session.name, action: `보증 연장 — ${detail}`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 보증 연장 — ${oldEnd} → ${newEnd}` }
}

/** 보증 일괄 연장 — 필터로 좁힌 자산 다수의 보증을 한 번에 연장한다(보증 만료 임박 대량 갱신).
 *  보증 없는 자산(SW·가상자원)·폐기 경로 자산은 건너뛴다. 각 건은 개별 이력·감사에 남는다. 자산담당·Admin. */
export async function extendWarrantyMany(assetNos: string[], termYears: number) {
  const session = await guard()
  if (!session) return { ok: false, message: '보증 연장 권한이 없습니다 (자산담당·Admin).' }
  if (![1, 2, 3].includes(termYears)) return { ok: false, message: '연장 기간은 1·2·3년만 가능합니다.' }
  if (!Array.isArray(assetNos) || assetNos.length === 0) return { ok: false, message: '연장할 자산을 선택하세요.' }

  const s = getStore()
  const t = today()
  let done = 0
  let skipped = 0
  for (const no of assetNos) {
    const asset = s.assets.find((a) => a.assetNo === no)
    if (!asset || asset.warrantyEnd === '-' || ['폐기완료', '폐기예정'].includes(asset.status)) { skipped += 1; continue }
    const base = asset.warrantyEnd >= t ? asset.warrantyEnd : t
    const [y, m, d] = base.split('-')
    const newEnd = `${Number(y) + termYears}-${m}-${d}`
    const oldEnd = asset.warrantyEnd
    asset.warrantyEnd = newEnd
    asset.history.push({ date: t, kind: '보증연장', detail: `보증 만료 ${oldEnd} → ${newEnd} (${termYears}년 연장 · 일괄)`, actor: session.name })
    done += 1
  }
  if (done === 0) return { ok: false, message: '연장 대상이 없습니다 (보증 없는 자산·폐기 자산 제외).' }
  appendAudit({ actor: session.name, action: `보증 일괄 연장 (${done}건 · ${termYears}년)${skipped ? ` · 제외 ${skipped}` : ''}`, target: '자산 대장' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `보증 일괄 연장 — ${done}건 ${termYears}년 연장${skipped ? ` (보증 없음·폐기 ${skipped}건 제외)` : ''}` }
}

/** 자산 대여(반출) 처리 — 유휴 재고를 반환 기한과 함께 대여자에게 내준다(불출이 영구 배정이라면 대여는 기한부).
 *  (제품안내서 §03 운영 — 출장·행사·임시 업무용 대여. 반환 기한이 지나면 연체로 드러난다.)
 *  유휴 자산만 대여 가능. 대여 중에는 불출 대상에서 빠져 영구 배정되지 않는다. 자산담당·Admin. */
export async function loanAsset(assetNo: string, rawTo: string, rawDept: string, dueDate: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 처리 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '유휴') return { ok: false, message: `대여 가능한 상태가 아닙니다 — ${assetNo} (${asset.status}). 유휴 재고만 대여할 수 있습니다.` }
  const to = rawTo.trim()
  const dept = rawDept.trim()
  if (!to || !dept) return { ok: false, message: '대여자와 부서를 입력해 주세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, message: '반환 기한을 선택해 주세요.' }
  if (dueDate < today()) return { ok: false, message: '반환 기한은 오늘 이후로 지정해 주세요.' }

  asset.status = '대여중'
  asset.owner = to
  asset.dept = dept
  asset.loanDueDate = dueDate
  asset.history.push({ date: today(), kind: '대여', detail: `${dept} ${to} 대여 — 반환 기한 ${dueDate}`, actor: session.name })
  appendAudit({ actor: session.name, action: `자산 대여 — ${to}(${dept}) · 기한 ${dueDate}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 처리 — ${to}(${dept}) · 반환 기한 ${dueDate}` }
}

/** 대여 반환 기한 연장 — 반납·재대여 없이 대여 기간을 늘린다(대여자가 더 오래 써야 할 때·연체 유예).
 *  현재 기한 이후로만 연장 가능(단축 불가). 이력·감사에 남긴다. 대여중 자산만 대상. 자산담당·Admin. */
export async function extendLoan(assetNo: string, newDueDate: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 연장 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '대여중') return { ok: false, message: '대여 중인 자산만 반환 기한을 연장할 수 있습니다.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) return { ok: false, message: '새 반환 기한을 선택해 주세요.' }
  if (newDueDate < today()) return { ok: false, message: '반환 기한은 오늘 이후로 지정해 주세요.' }
  const cur = asset.loanDueDate ?? ''
  if (cur && newDueDate <= cur) return { ok: false, message: `현재 기한(${cur}) 이후로만 연장할 수 있습니다.` }

  asset.loanDueDate = newDueDate
  asset.history.push({ date: today(), kind: '대여', detail: `대여 반환 기한 연장 ${cur || '-'} → ${newDueDate}`, actor: session.name })
  appendAudit({ actor: session.name, action: `대여 반환 기한 연장 — ${cur || '-'} → ${newDueDate}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 반환 기한 연장 — ${cur || '-'} → ${newDueDate}` }
}

/** 대여 반환 접수 — 대여 자산을 회수해 유휴 풀로 되돌린다(연체 여부와 무관하게 반환 처리).
 *  소유자를 비우고 검수실로 편성해 재확인 후 재배치한다. 대여중 자산만 대상. 자산담당·Admin. */
export async function returnLoan(assetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 반환 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '대여중') return { ok: false, message: '대여 중인 자산만 반환할 수 있습니다.' }

  const borrower = asset.owner
  const overdue = asset.loanDueDate ? asset.loanDueDate < today() : false
  asset.status = '유휴'
  asset.owner = '미지정'
  asset.dept = '자산관리팀'
  asset.location = '본사 3F 검수실'
  asset.loanDueDate = undefined
  asset.history.push({ date: today(), kind: '반납', detail: `대여 반환 접수 — 유휴 풀 편성 (대여자 ${borrower}${overdue ? ' · 연체 반환' : ''})`, actor: session.name })
  appendAudit({ actor: session.name, action: `대여 반환 접수 — ${borrower}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 반환 — 유휴 풀 편성 (검수실 재확인 후 재배치)` }
}

/** 자산 장애 신고 — 사용 중 자산의 고장·오작동을 보유자(또는 자산담당)가 신고해 수리 대기로 편성한다.
 *  (제품안내서 §03 운영·유지보수 — 그동안 수리는 반납 점검에서만 시작돼, 실물을 계속 쓰는 사용자가
 *   장애를 알려 수리를 개시할 경로가 없었다. 반납보다 가벼운 사용자 발화형 수리 진입점.)
 *  사용자는 본인 명의 자산만, 자산담당·Admin 은 전체 대상. 사용 중 자산만 대상(유휴·수리중·폐기 등 제외).
 *  상태를 '수리중'으로 전환하면 반납 화면 '수리 대기'에 떠서 자산담당이 업체 배정·수리 완료/불가를 처리한다(기존 수리 흐름 재사용). */
export async function reportFault(assetNo: string, rawNote: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '사용중') return { ok: false, message: `사용 중 자산만 장애 신고할 수 있습니다 — ${assetNo} (${asset.status})` }
  if (session.role === 'USER' && asset.owner !== session.name) {
    return { ok: false, message: '본인 명의 자산만 장애 신고할 수 있습니다.' }
  }
  const note = rawNote.trim()
  if (!note) return { ok: false, message: '장애 증상을 입력해 주세요.' }

  const reporter = asset.owner && asset.owner !== '미지정' && asset.owner !== '-' ? `${asset.owner}·${asset.dept}` : session.name
  asset.status = '수리중'
  asset.faultNote = note // 수리 대기 화면에서 자산담당이 증상을 보고 업체·조치를 정하게 한다
  asset.history.push({ date: today(), kind: '수리', detail: `장애 신고 — ${note} (신고 ${session.name}, 보유 ${reporter})`, actor: session.name })
  // 자산관리팀에 접수 통보 — 수리 대기열에 편성됐음을 알려 업체 배정·처리를 개시하게 한다(발송 이력 적재)
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `자산 장애 신고 접수 — ${asset.assetNo} ${asset.model} · ${note.slice(0, 40)}`, kind: '장애 신고', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 장애 신고 — ${asset.model} (${note.slice(0, 30)})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 장애 신고 접수 — 수리 대기로 편성, 자산관리팀에 통보했습니다.` }
}

/** 자산 수령(인수) 확인 — 불출로 배정받은 자산을 사용자가 실물 수령했음을 확인한다(체인 오브 커스터디).
 *  (제품안내서 §03 불출·인수 — 그동안 불출은 담당자 처리·수령 안내 발송뿐이고, 사용자 인수 확인 접점이 없어
 *   실물 인계 사실을 감사에서 증명할 수 없었다. 공지 읽음 확인과 같은 사용자 쓰기 접점.)
 *  사용자는 본인 명의 수령 대기 자산만, 자산담당·Admin 도 처리 가능(대리 확인). 확인 시 대기 해제·이력 적재·자산관리팀 통보. */
export async function confirmReceipt(assetNo: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (!asset.receiptPending) return { ok: false, message: '수령 확인 대기 중인 자산이 아닙니다.' }
  if (session.role === 'USER' && asset.owner !== session.name) {
    return { ok: false, message: '본인 명의 자산만 수령 확인할 수 있습니다.' }
  }
  asset.receiptPending = undefined
  asset.history.push({ date: today(), kind: '점검', detail: `수령(인수) 확인 — ${session.name} 정상 수령`, actor: session.name })
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `자산 수령 확인 — ${asset.assetNo} ${asset.model} · ${session.name} 인수`, kind: '수령 확인', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 수령(인수) 확인 — ${asset.model}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 수령 확인 완료 — 인수 이력 적재, 자산관리팀에 통보했습니다.` }
}

/** 분실·도난 신고 — 실물이 사라진 자산을 대장에서 '분실' 상태로 전환한다.
 *  (제품안내서 §03 자산 실물 관리 — 재물조사 대사는 '미확인→유휴·분실 후보'만 수동적으로 잡고,
 *   사용자·자산팀이 직접 아는 분실·도난을 신고할 경로가 없었다.)
 *  도난은 단말 내 데이터 유출 위험이 있어 보안운영팀에 통지한다(위협 대응). 회수 시 recoverAsset,
 *  미회수 확정 시 폐기 절차(선정)로 넘긴다. 이미 분실·폐기 절차 중인 자산은 대상 아님. 자산담당·Admin. */
export async function reportLostStolen(assetNo: string, type: '분실' | '도난', rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '분실·도난 신고 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status === '분실') return { ok: false, message: '이미 분실·도난 신고된 자산입니다.' }
  if (asset.status === '폐기예정' || asset.status === '폐기완료') {
    return { ok: false, message: `폐기 절차 중인 자산은 신고할 수 없습니다 — ${assetNo} (${asset.status})` }
  }
  const note = rawNote.trim()
  if (!note) return { ok: false, message: '분실·도난 정황(마지막 확인 위치·경위)을 입력해 주세요.' }

  const holder = asset.owner && asset.owner !== '미지정' && asset.owner !== '-' ? `${asset.owner}·${asset.dept}` : asset.dept
  asset.status = '분실'
  asset.history.push({ date: today(), kind: '분실', detail: `${type} 신고 — ${note} (최종 보유 ${holder})`, actor: session.name })

  if (type === '도난') {
    // 도난은 단말 내 데이터 유출 위험이 있어 보안운영팀에 침해 대응을 통보한다 — 시간 임계라 문자 즉시 알림 병행
    escalate({ to: '보안운영팀', subject: `${asset.assetNo} ${asset.model} 도난 신고 — 데이터 유출 위험 점검 요청 (${note})`, kind: '위협 대응', ref: asset.assetNo, sms: `${asset.assetNo} ${asset.model} 도난 — 데이터 유출 위험 점검` })
  }
  appendAudit({ actor: session.name, action: `${type} 신고 — ${asset.model} · ${note}`, target: assetNo })
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: type === '도난'
      ? `${assetNo} 도난 신고 — 분실 처리 · 보안운영팀 앞 유출 위험 점검 통보`
      : `${assetNo} 분실 신고 — 분실 처리 (회수 시 해제, 미회수 확정 시 폐기 절차)`,
  }
}

/** 분실 회수 — 분실 신고된 자산을 되찾아 유휴 풀로 되돌린다.
 *  실물이 손에 돌아왔으므로 소유자를 비우고 검수실로 편성해 재확인 후 재배치한다(반납 정상 처리와 동형).
 *  분실 상태만 대상. 자산담당·Admin. */
export async function recoverAsset(assetNo: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '회수 처리 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '분실') return { ok: false, message: '분실 신고된 자산만 회수할 수 있습니다.' }

  const note = rawNote.trim()
  asset.status = '유휴'
  asset.owner = '미지정'
  asset.dept = '자산관리팀'
  asset.location = '본사 3F 검수실'
  asset.history.push({ date: today(), kind: '점검', detail: `분실 자산 회수 — 유휴 풀 편성${note ? ` (${note})` : ''}`, actor: session.name })
  appendAudit({ actor: session.name, action: `분실 자산 회수 — ${asset.model}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 회수 — 유휴 풀 편성 (검수실 재확인 후 재배치)` }
}

/** CSV 일괄 자산 등록 — 기존 자산을 대장으로 마이그레이션(데이터 온보딩)한다.
 *  한 행 = 자산 하나. 필드: 유형,모델,시리얼,소유자,부서,위치 (유형·모델 필수, 나머지 선택).
 *  유형이 유효하지 않거나 모델이 비었거나 시리얼이 기존/입력분과 중복이면 건너뛴다(사유 반환).
 *  생성 자산은 상태 '검수중'으로 대장에 오르고 등록 이력·감사가 남는다. 자산담당·Admin. */
export async function bulkRegisterAssets(rows: { category: string; model: string; serial?: string; owner?: string; dept?: string; location?: string }[]) {
  const session = await guard()
  if (!session) return { ok: false, message: '일괄 등록 권한이 없습니다 (자산담당·Admin).', created: 0, skipped: [] as { line: number; reason: string }[] }
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, message: '등록할 행이 없습니다.', created: 0, skipped: [] }
  if (rows.length > 500) return { ok: false, message: '한 번에 최대 500행까지 등록할 수 있습니다.', created: 0, skipped: [] }

  const s = getStore()
  const existingSerials = new Set(s.assets.map((a) => a.serial).filter(Boolean))
  const batchSerials = new Set<string>()

  const created: string[] = []
  const skipped: { line: number; reason: string }[] = []

  rows.forEach((r, i) => {
    const line = i + 1
    const category = (r.category ?? '').trim()
    const model = (r.model ?? '').trim()
    const serial = (r.serial ?? '').trim()
    if (!IMPORT_CATS.includes(category as AssetCategory)) { skipped.push({ line, reason: `유형 오류 '${category || '-'}'` }); return }
    if (!model) { skipped.push({ line, reason: '모델 누락' }); return }
    if (serial && (existingSerials.has(serial) || batchSerials.has(serial))) { skipped.push({ line, reason: `시리얼 중복 '${serial}'` }); return }

    const assetNo = nextAssetNo()
    const sn = serial || `SN-${assetNo.slice(-6)}`
    const asset: Asset = {
      assetNo,
      category: category as AssetCategory,
      model,
      serial: sn,
      status: '검수중',
      owner: (r.owner ?? '').trim() || '-',
      dept: (r.dept ?? '').trim() || '자산관리팀',
      location: (r.location ?? '').trim() || '본사 3F 검수실',
      purchaseDate: today(),
      warrantyEnd: '-',
      history: [{ date: today(), kind: '등록', detail: `CSV 일괄 등록 — 데이터 온보딩 (검수중)`, actor: session.name }],
    }
    s.assets.push(asset)
    batchSerials.add(sn)
    created.push(assetNo)
  })

  if (created.length === 0) return { ok: false, message: `등록된 자산이 없습니다 (전체 ${rows.length}행 건너뜀).`, created: 0, skipped }
  appendAudit({ actor: session.name, action: `CSV 일괄 자산 등록 (${created.length}건${skipped.length ? ` · 건너뜀 ${skipped.length}` : ''})`, target: '자산 대장' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `일괄 등록 완료 — ${created.length}건 대장 편입(검수중)${skipped.length ? `, ${skipped.length}행 건너뜀` : ''}`, created: created.length, skipped }
}
