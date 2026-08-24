'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { addYears, isMaintenanceOverdue, today } from '@/lib/dates'
import { eolOsOf, isEolTarget } from '@/lib/eol'
import { reclaimLicenseSeats, transferLicenseSeats } from '@/lib/license'
import { dispatch, escalate } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextAssetNo, nextId } from '@/lib/store'
import type { Asset, AssetCategory, BizCriticality, ReturnCondition } from '@/lib/types'

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

/** 업무 중요도 일괄 지정 — 연 1회 자산 분류 재검토(ISO 27001 A.8.2)에서 같은 등급으로 분류할 다수 자산을 한 번에 지정한다.
 *  건별 로직은 setAssetCriticality 와 동일하고 감사만 일괄로 남긴다. 이미 해당 등급인 자산은 건너뛴다(멱등). 자산담당·Admin. */
export async function setAssetCriticalityMany(assetNos: string[], level: BizCriticality) {
  const session = await guard()
  if (!session) return { ok: false, message: '업무 중요도 지정 권한이 없습니다 (자산담당·Admin).' }
  if (!CRITICALITY_LEVELS.includes(level)) return { ok: false, message: '업무 중요도 값이 올바르지 않습니다.' }

  const s = getStore()
  const targets = s.assets.filter((a) => assetNos.includes(a.assetNo) && (a.criticality ?? '일반') !== level)
  if (targets.length === 0) return { ok: false, message: `업무 중요도 '${level}'로 변경할 자산이 없습니다 (이미 해당 등급인 건 제외).` }
  for (const asset of targets) {
    const before = asset.criticality ?? '일반'
    asset.criticality = level
    asset.history.push({ date: today(), kind: '구성변경', detail: `업무 중요도 ${before} → ${level}`, actor: session.name })
  }
  const names = targets.map((a) => a.assetNo).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `업무 중요도 일괄 변경 → ${level} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: '자산 대장' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${targets.length}건 업무 중요도 '${level}' 지정 — 취약점 우선순위 스코어링에 반영` }
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
    // 종료(터미널) 상태 자산은 계약에 새로 연계할 수 없다 — 이탈·폐기 자산이 유지보수 커버리지·연계 자산 수를 부풀린다(좌석 배정 종료-상태 가드와 동형). 해제(unlink)는 상태 무관.
    if (['분실', '폐기완료'].includes(asset.status)) return { ok: false, message: `종료 상태(${asset.status}) 자산은 계약에 연계할 수 없습니다 — ${assetNo}.` }
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

/** 자산–계약 일괄 연계 — 유지보수·구매 계약이 한 대가 아니라 다수(예: HW 유지보수 40대)를 덮는 상황에서 선택 자산을 한 번에 한 계약에 연계한다.
 *  건별 setAssetContract 와 동일 규약(해지 계약 제외, 이미 그 계약 연계분 제외)이고 감사만 일괄로 남긴다. 보증 일괄 연장·오프보딩 일괄 회수와 같은 배치 패턴. 자산담당·Admin. */
export async function setAssetContractMany(assetNos: string[], rawContractId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '계약 연계 권한이 없습니다 (자산담당·Admin).' }
  const contractId = rawContractId.trim()
  if (!contractId) return { ok: false, message: '연계할 계약을 선택하세요.' }
  const s = getStore()
  const c = s.contracts.find((x) => x.id === contractId)
  if (!c) return { ok: false, message: '계약을 찾을 수 없습니다.' }
  if (c.status === '해지') return { ok: false, message: '해지된 계약에는 연계할 수 없습니다.' }
  // 종료(터미널) 상태 자산은 건너뛴다 — 이탈·폐기 자산이 유지보수 커버리지·연계 자산 수를 부풀리지 않게(단건 가드와 동형·멱등).
  const targets = s.assets.filter((a) => assetNos.includes(a.assetNo) && a.contractId !== contractId && !['분실', '폐기완료'].includes(a.status))
  if (targets.length === 0) return { ok: false, message: '연계할 자산이 없습니다 (이미 연계된 건·종료 상태 자산 제외).' }
  for (const asset of targets) {
    const before = asset.contractId ?? '(없음)'
    asset.contractId = contractId
    asset.history.push({ date: today(), kind: '구성변경', detail: `계약 연계 ${before} → ${contractId} (${c.name}) (일괄)`, actor: session.name })
  }
  appendAudit({ actor: session.name, action: `자산–계약 일괄 연계 (${targets.length}건) → ${contractId} (${c.name})`, target: contractId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${targets.length}건 → ${contractId} (${c.name}) 계약 일괄 연계 완료` }
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
  const newEnd = addYears(base, termYears)
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
    const newEnd = addYears(base, termYears)
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
  // 폐기 절차(대상 선정~소거 대기) 중인 유휴 자산은 재불출 대상이 아니다 — 파기 예정 자산이 다시 순환되면 안 된다(가용 재고 산정과 동일 판정).
  if (s.disposals.some((d) => d.assetNo === assetNo && d.status !== '완료')) return { ok: false, message: `폐기 절차 중인 자산은 대여할 수 없습니다 — ${assetNo} (먼저 폐기 대상 선정을 취소하세요).` }
  const to = rawTo.trim()
  const dept = rawDept.trim()
  if (!to || !dept) return { ok: false, message: '대여자와 부서를 입력해 주세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, message: '반환 기한을 선택해 주세요.' }
  if (dueDate < today()) return { ok: false, message: '반환 기한은 오늘 이후로 지정해 주세요.' }

  asset.status = '대여중'
  asset.owner = to
  asset.dept = dept
  asset.loanDueDate = dueDate
  // 이전 대여분에서 남았을 수 있는 연장·반납 요청을 새 대여 시작 시 반드시 정리한다 —
  // 안 그러면 이전 대여자가 올린 요청이 새 대여자의 대여에 잘못 적용될 수 있다(오적용·오통보 방지).
  asset.loanExtendRequest = undefined
  asset.returnRequest = undefined
  asset.history.push({ date: today(), kind: '대여', detail: `${dept} ${to} 대여 — 반환 기한 ${dueDate}`, actor: session.name })
  // 대여자에게 대여 사실·반환 기한을 통보한다(불출 완료 통보의 대여판) — 반환 책임의 기준점이 된다.
  dispatch({ channel: '이메일', to: `${to} (${dept})`, subject: `자산 대여 — ${asset.assetNo} ${asset.model} 대여, 반환 기한 ${dueDate}까지`, kind: '자산 대여', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 대여 — ${to}(${dept}) · 기한 ${dueDate} · 대여자 통보`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 처리 — ${to}(${dept}) · 반환 기한 ${dueDate}` }
}

/** 자산 일괄 대여 — 교육·행사용 로너(loaner) 풀처럼 유휴 재고 다수를 한 대여자·부서·반환 기한으로 한 번에 대여한다.
 *  건별 로직은 loanAsset 과 동일하고 감사만 일괄로 남긴다. 유휴 재고만 대상(멱등). 자산담당·Admin. */
export async function loanAssetMany(assetNos: string[], rawTo: string, rawDept: string, dueDate: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 처리 권한이 없습니다 (자산담당·Admin).' }
  const to = rawTo.trim()
  const dept = rawDept.trim()
  if (!to || !dept) return { ok: false, message: '대여자와 부서를 입력해 주세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, message: '반환 기한을 선택해 주세요.' }
  if (dueDate < today()) return { ok: false, message: '반환 기한은 오늘 이후로 지정해 주세요.' }
  const s = getStore()
  // 유휴 재고만, 폐기 절차(완료 제외) 중인 자산은 제외 — 파기 예정 자산 재순환 방지(단건 가드·가용 재고 산정과 동일 판정).
  const pendingDisposal = new Set(s.disposals.filter((d) => d.status !== '완료').map((d) => d.assetNo))
  const targets = s.assets.filter((a) => assetNos.includes(a.assetNo) && a.status === '유휴' && !pendingDisposal.has(a.assetNo))
  if (targets.length === 0) return { ok: false, message: '대여할 자산이 없습니다 (유휴 재고만·폐기 절차 자산 제외).' }
  for (const asset of targets) {
    asset.status = '대여중'
    asset.owner = to
    asset.dept = dept
    asset.loanDueDate = dueDate
    asset.loanExtendRequest = undefined
    asset.returnRequest = undefined
    asset.history.push({ date: today(), kind: '대여', detail: `${dept} ${to} 대여 — 반환 기한 ${dueDate} (일괄)`, actor: session.name })
    dispatch({ channel: '이메일', to: `${to} (${dept})`, subject: `자산 대여 — ${asset.assetNo} ${asset.model} 대여, 반환 기한 ${dueDate}까지`, kind: '자산 대여', ref: asset.assetNo })
  }
  appendAudit({ actor: session.name, action: `자산 일괄 대여 — ${to}(${dept}) · 기한 ${dueDate} (${targets.length}건) · 대여자 통보`, target: '대여' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${targets.length}건 대여 처리 — ${to}(${dept}) · 반환 기한 ${dueDate}` }
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
  asset.loanExtendRequest = undefined // 담당자 직접 연장 시 대기 중이던 연장 요청도 해제
  asset.returnRequest = undefined // 연장은 대여 처분을 확정 — 대기 중이던 반납 신청도 함께 해제(스테일 신청·이중 큐 방지)
  asset.history.push({ date: today(), kind: '대여', detail: `대여 반환 기한 연장 ${cur || '-'} → ${newDueDate}`, actor: session.name })
  appendAudit({ actor: session.name, action: `대여 반환 기한 연장 — ${cur || '-'} → ${newDueDate}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 반환 기한 연장 — ${cur || '-'} → ${newDueDate}` }
}

/** 대여 반환 기한 연장 요청 — 대여자(사용자)가 본인 대여 자산의 반환 기한 연장을 자산담당에게 신청한다.
 *  (그동안 연장은 자산담당만 할 수 있어, 대여자는 기한이 다가와도 셀프서비스로 연장을 요청할 경로가 없었다 — 다른 사용자 신청과 달리.)
 *  본인 대여중 자산만, 현재 기한 이후 날짜로만. 요청은 자산담당에게 통보되고 대장 상세에 뜬다. 승인 시 실제 연장, 반려 시 요청만 해제. */
export async function requestLoanExtension(assetNo: string, rawNewDueDate: string, rawReason: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '대여중' || asset.owner !== session.name) return { ok: false, message: '본인 대여 중인 자산만 연장 요청할 수 있습니다.' }
  // 연장과 반납은 상반된 처분 — 반납 신청 중이면 연장 요청 불가(모순 상태·이중 큐 방지). 반납 신청을 먼저 취소해야 한다.
  if (asset.returnRequest) return { ok: false, message: '반납 신청 중인 자산입니다 — 반납 신청을 취소한 뒤 연장 요청하세요.' }
  const newDueDate = rawNewDueDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate) || newDueDate <= (asset.loanDueDate ?? today())) {
    return { ok: false, message: `연장 기한은 현재 반환 기한(${asset.loanDueDate ?? '-'}) 이후로 지정하세요.` }
  }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '연장 사유를 입력하세요.' }
  asset.loanExtendRequest = { newDueDate, reason, by: session.name, at: today() }
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `대여 반환 기한 연장 요청 — ${asset.assetNo} ${asset.model} (${session.name}) ${asset.loanDueDate ?? '-'} → ${newDueDate}`, kind: '자산 대여', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 반환 기한 연장 요청 — ${asset.loanDueDate ?? '-'} → ${newDueDate} (${reason})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `연장 요청 발송 — 자산관리팀 검토 후 승인되면 기한이 ${newDueDate}로 연장됩니다.` }
}

/** 대여 연장 요청 승인 — 자산담당이 대여자의 연장 요청을 요청대로 반영한다(요청 날짜로 반환 기한 연장·요청자 통보). 자산담당·Admin. */
export async function grantLoanExtension(assetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 연장 승인 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  const req = asset.loanExtendRequest
  if (!req || asset.status !== '대여중') return { ok: false, message: '연장 요청이 없는 자산입니다.' }
  // 요청 기한이 현재 반환 기한 이후인지 재확인 — 오래된(스테일) 요청으로 현재 대여가 단축되지 않게 한다.
  if (req.newDueDate <= (asset.loanDueDate ?? today())) {
    return { ok: false, message: `연장 요청 기한(${req.newDueDate})이 현재 반환 기한(${asset.loanDueDate ?? '-'}) 이후가 아닙니다 — 반려 후 재요청하세요.` }
  }
  const cur = asset.loanDueDate ?? '-'
  asset.loanDueDate = req.newDueDate
  asset.loanExtendRequest = undefined
  asset.returnRequest = undefined // 연장 승인은 대여 처분을 확정 — 대기 중이던 반납 신청도 함께 해제(스테일 신청·이중 큐 방지)
  asset.history.push({ date: today(), kind: '대여', detail: `대여 연장 요청 승인 — ${cur} → ${req.newDueDate} (요청자 ${req.by} · ${req.reason})`, actor: session.name })
  dispatch({ channel: '이메일', to: req.by, subject: `대여 연장 승인 — ${asset.assetNo} ${asset.model} 반환 기한 ${req.newDueDate}로 연장`, kind: '자산 대여', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 연장 요청 승인 — ${cur} → ${req.newDueDate} (요청자 ${req.by})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 연장 승인 — ${cur} → ${req.newDueDate} · 요청자 통보` }
}

/** 대여 연장 요청 반려 — 요청만 해제하고 기한은 유지한다(사유는 이력에 남긴다). 자산담당·Admin. */
export async function declineLoanExtension(assetNo: string, rawReason: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 연장 반려 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  const req = asset.loanExtendRequest
  if (!req) return { ok: false, message: '연장 요청이 없는 자산입니다.' }
  const reason = rawReason.trim()
  asset.loanExtendRequest = undefined
  asset.history.push({ date: today(), kind: '대여', detail: `대여 연장 요청 반려 (요청자 ${req.by} · ${req.newDueDate})${reason ? ` — ${reason}` : ''}`, actor: session.name })
  dispatch({ channel: '이메일', to: req.by, subject: `대여 연장 반려 — ${asset.assetNo} ${asset.model} (반환 기한 ${asset.loanDueDate ?? '-'} 유지)${reason ? ` · ${reason}` : ''}`, kind: '자산 대여', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 연장 요청 반려 — ${asset.assetNo} (요청자 ${req.by})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 연장 반려 — 기한 유지·요청자 통보` }
}

/** 대여 연장 요청 취소 — 요청자(대여자 본인)가 자산담당 처리 전에 자신의 연장 요청을 철회한다. 기한은 유지한다. */
export async function cancelLoanExtension(assetNo: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  const req = asset.loanExtendRequest
  if (!req) return { ok: false, message: '연장 요청이 없는 자산입니다.' }
  if (req.by !== session.name) return { ok: false, message: '본인이 올린 연장 요청만 취소할 수 있습니다.' }
  asset.loanExtendRequest = undefined
  asset.history.push({ date: today(), kind: '대여', detail: `대여 연장 요청 취소 (요청자 ${req.by} · ${req.newDueDate})`, actor: session.name })
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `대여 연장 요청 취소 — ${asset.assetNo} ${asset.model} (${req.by}, 반환 기한 ${asset.loanDueDate ?? '-'} 유지)`, kind: '자산 대여', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 연장 요청 취소 — ${asset.assetNo} (${req.newDueDate})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 대여 연장 요청 취소 — 기한 유지` }
}

/** 반납(반환) 신청 — 대여자(사용자 본인)가 대여를 마치고 자산을 돌려주겠다고 자산담당에 알린다.
 *  상태는 바꾸지 않고 신호만 남긴다(실제 회수·점검은 자산담당의 반환 접수로 진행). 본인 대여 중 자산만. */
export async function requestReturn(assetNo: string, rawNote = '') {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '대여중' || asset.owner !== session.name) return { ok: false, message: '본인 대여 중인 자산만 반납 신청할 수 있습니다.' }
  if (asset.returnRequest) return { ok: false, message: '이미 반납 신청된 자산입니다.' }
  // 반납과 연장은 상반된 처분 — 연장 요청 중이면 반납 신청 불가(모순 상태·이중 큐 방지). 연장 요청을 먼저 취소해야 한다.
  if (asset.loanExtendRequest) return { ok: false, message: '연장 요청 중인 자산입니다 — 연장 요청을 취소한 뒤 반납 신청하세요.' }
  const note = rawNote.trim()
  asset.returnRequest = { by: session.name, at: today(), note: note || undefined }
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `대여 반납 신청 — ${asset.assetNo} ${asset.model} (${session.name})${note ? ` · ${note}` : ''}`, kind: '반납 접수', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 반납 신청${note ? ` — ${note}` : ''}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: '반납 신청 접수 — 자산관리팀이 회수·점검 후 반환 처리합니다.' }
}

/** 반납 신청 취소 — 신청자(대여자 본인)가 반환 접수 전에 자신의 반납 신청을 철회한다. 상태는 그대로 대여중. */
export async function cancelReturnRequest(assetNo: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  const req = asset.returnRequest
  if (!req) return { ok: false, message: '반납 신청이 없는 자산입니다.' }
  if (req.by !== session.name) return { ok: false, message: '본인이 올린 반납 신청만 취소할 수 있습니다.' }
  asset.returnRequest = undefined
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `대여 반납 신청 취소 — ${asset.assetNo} ${asset.model} (${req.by})`, kind: '반납 접수', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `대여 반납 신청 취소 — ${asset.assetNo}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 반납 신청 취소 — 대여 유지` }
}

/** 대여 반환 접수 — 대여 자산을 회수해 유휴 풀로 되돌린다(연체 여부와 무관하게 반환 처리).
 *  소유자를 비우고 검수실로 편성해 재확인 후 재배치한다. 대여중 자산만 대상. 자산담당·Admin. */
export async function returnLoan(assetNo: string, condition: ReturnCondition = '정상', rawNote = '') {
  const session = await guard()
  if (!session) return { ok: false, message: '대여 반환 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '대여중') return { ok: false, message: '대여 중인 자산만 반환할 수 있습니다.' }

  const borrower = asset.owner
  const overdue = asset.loanDueDate ? asset.loanDueDate < today() : false
  const note = rawNote.trim()
  const loc = '본사 3F 검수실'
  asset.loanDueDate = undefined
  asset.returnRequest = undefined // 반납 신청분을 접수 처리하면 신청 신호 해제(스테일 신청 방지)
  asset.loanExtendRequest = undefined // 대여가 끝나므로 대기 중이던 연장 요청도 함께 해제(대시보드 큐·오적용 방지)
  // 대여 반환도 보유자를 떠나는 이탈 경로 — 반환 자산의 라이선스 좌석을 회수한다(로56 좌석 생애주기 · 유휴/수리 풀 재대여 전 여유석 복귀).
  //  폐기 권고분은 이후 recordWipe 가 다시 회수를 시도해도 멱등(이미 회수됨)이라 안전하다. recoverFromUser(오프보딩 회수)와 동일 규약.
  const freedSeats = reclaimLicenseSeats(assetNo, session.name, '대여 반환')
  // 대여 반환도 반납(receiveReturn)과 같이 상태 점검으로 가른다 — 손상된 반환분이 바로 유휴 풀에 들어가 재대여/재불출되면 안 된다.
  //  정상 → 유휴 · 수리 필요 → 수리중(수리 후 유휴) · 폐기 권고 → 폐기예정(폐기 절차 편입).
  if (condition === '폐기 권고') {
    asset.status = '폐기예정'
    // 대여 반환으로 보유자를 떠났으므로 소유자를 비운다 — 다른 점검 결과와 동일 불변식(폐기 취소·반려로 유휴 복귀 시 오귀속 방지).
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    if (!s.disposals.some((d) => d.assetNo === assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason: `대여 반환 점검 폐기 권고${note ? ` — ${note}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
    }
  } else if (condition === '수리 필요') {
    asset.status = '수리중'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = loc
    asset.faultNote = note || '대여 반환 점검 — 수리 필요'
  } else {
    asset.status = '유휴'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = loc
  }
  asset.history.push({ date: today(), kind: condition === '폐기 권고' ? '폐기' : condition === '수리 필요' ? '수리' : '반납', detail: `대여 반환 접수 · 상태 점검 ${condition}${note ? ` — ${note}` : ''} (대여자 ${borrower}${overdue ? ' · 연체 반환' : ''})${freedSeats.length ? ` · 라이선스 좌석 ${freedSeats.length}석 회수` : ''}`, actor: session.name })
  // 대여자에게 반환 접수 결과를 통보한다(반납 접수 통보의 대여판) — 특히 수리 필요·폐기 권고는 파손 책임 안내가 필요하다.
  const notified = borrower && borrower !== '미지정' && borrower !== '-'
  if (notified) {
    dispatch({ channel: '이메일', to: borrower, subject: `대여 반환 접수 완료 — ${asset.assetNo} ${asset.model} · 점검 결과 ${condition}${note ? ` (${note})` : ''}`, kind: '반납 접수', ref: asset.assetNo })
  }
  appendAudit({ actor: session.name, action: `대여 반환 접수 (${condition}) — ${borrower}${notified ? ' · 대여자 통보' : ''}`, target: assetNo })
  revalidatePath('/', 'layout')
  const outcome = condition === '수리 필요' ? '수리중 편성 (수리 후 유휴 풀)' : condition === '폐기 권고' ? '폐기 절차 편입 (폐기예정)' : '유휴 풀 편성 (재배치 가능)'
  return { ok: true, message: `${assetNo} 대여 반환 (${condition}) — ${outcome}` }
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

/** 장애 신고 취소(오신고 철회) — 잘못 신고했거나 재현되지 않는 장애 신고를 업체 배정 전에 철회해 자산을 사용중으로 되돌린다.
 *  (반납 신청 취소·대여 연장 요청 취소·상신 취소처럼, 사용자가 시작한 조치는 처리 전 스스로 되돌릴 수 있어야 한다 —
 *   장애 신고만 철회 경로가 없어 오신고 시 수리중에 갇히고 하지도 않은 수리 이력이 남았다.)
 *  수리 의뢰(업체 배정) 전, 장애 신고 직후 상태만 대상 — 반납·분실 점검으로 편성된 수리중이나 수리 진행 건은 제외한다.
 *  사용자는 본인 명의 자산만, 자산담당·Admin 은 전체 대상. */
export async function cancelFault(assetNo: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '수리중') return { ok: false, message: `수리중 자산만 장애 신고를 철회할 수 있습니다 — ${assetNo} (${asset.status})` }
  if (session.role === 'USER' && asset.owner !== session.name) {
    return { ok: false, message: '본인 명의 자산만 장애 신고를 철회할 수 있습니다.' }
  }
  // 장애 신고 직후 상태만 철회 대상 — 업체 배정(repair) 후나, 반납·분실 점검으로 편성된 수리중은 제외한다.
  const last = asset.history[asset.history.length - 1]
  if (asset.repair || !last || last.kind !== '수리' || !last.detail.startsWith('장애 신고 —')) {
    return { ok: false, message: '수리 업체 배정 전, 장애 신고 직후 상태만 철회할 수 있습니다 (수리 진행·반납 점검 건 제외).' }
  }

  asset.status = '사용중'
  asset.faultNote = undefined
  asset.history.push({ date: today(), kind: '수리', detail: `장애 신고 취소(오신고 철회) — ${session.name}`, actor: session.name })
  // 접수 통보의 짝 — 자산관리팀에 철회 사실을 알려 수리 대기열에서 빠졌음을 알린다(발송 이력 적재)
  dispatch({ channel: '이메일', to: '자산관리팀', subject: `자산 장애 신고 철회 — ${asset.assetNo} ${asset.model} (수리 대기 해제)`, kind: '장애 신고', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 장애 신고 취소(오신고 철회) — ${asset.model}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 장애 신고 철회 — 사용중으로 복원, 수리 대기에서 제외했습니다.` }
}

/** 자산 회수(반납 처리) — 사용 중 자산을 자산담당이 직접 회수해 반납 접수 대기열로 보낸다.
 *  (제품안내서 §03 운영 — 그동안 반납은 사용자 상신에서만 시작돼, 퇴직·조직 개편 등으로 사용자가 직접 반납할 수 없는
 *   자산을 자산팀이 회수할 경로가 없었다. 오프보딩·재배정 회수의 진입점.) 반납대기로 보내면 반납 점검(returns) 흐름을
 *   그대로 타서 유휴 풀/수리/폐기로 분기된다. 사용 중 자산만 대상. 자산담당·Admin. */
export async function recoverFromUser(assetNo: string, rawReason: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '자산 회수 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '사용중') return { ok: false, message: `사용 중 자산만 회수할 수 있습니다 — ${assetNo} (${asset.status})` }
  const reason = rawReason.trim()
  const holder = asset.owner
  // 반납대기로 — 소유자는 유지(반납 점검에서 prevOwner 로 쓰이고, 접수 시 미지정으로 비워진다)
  asset.status = '반납대기'
  asset.history.push({ date: today(), kind: '반납', detail: `자산 회수(반납 처리) — ${holder} 보유분 회수${reason ? ` · ${reason}` : ''} (오프보딩·재배정)`, actor: session.name })
  // 오프보딩 좌석 회수 — 떠나는 보유자에게 물린 라이선스 좌석을 함께 회수한다(로56 좌석 생애주기). 여유석으로 돌아가 재배정 대상이 된다.
  const freed = reclaimLicenseSeats(assetNo, session.name, '오프보딩 회수')
  if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (오프보딩)`, actor: session.name })
  asset.receiptPending = undefined // 미확인 수령 대기 해제 — 보유자를 떠난 자산은 인수 대기 대상이 아니다(스테일 수령 미확인 방지)
  // 회수 통보 — 보유자(부서)에게 회수 사실을 알린다
  if (holder && holder !== '미지정' && holder !== '-') {
    dispatch({ channel: '이메일', to: `${holder} (${asset.dept})`, subject: `자산 회수 — ${asset.assetNo} ${asset.model} 반납 처리${reason ? ` (${reason})` : ''}`, kind: '반납 접수', ref: asset.assetNo })
  }
  appendAudit({ actor: session.name, action: `자산 회수(반납 처리) — ${asset.model} (${holder})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 회수 — 반납 접수 대기열로 편성 (${holder} → 점검 후 유휴 풀/수리/폐기)${freed.length ? ` · 라이선스 좌석 ${freed.length}석 회수` : ''}` }
}

/** 자산 재배정(직접 인계) — 사용 중 자산을 반납·재불출 왕복 없이 새 보유자에게 직접 인계한다.
 *  (제품안내서 §03 — 회수(recoverFromUser)는 반납 점검을 거쳐 유휴로 돌리지만, 팀 내 인수인계·후임 승계처럼 실물이 창고로
 *   돌아가지 않고 사람만 바뀌는 경우 반납→재불출 왕복이 불필요·부정확했다. 그동안 소유자 변경은 correctField 가 '이동·불출
 *   결재로 처리하라'며 막았지만 이동은 위치만, 불출은 유휴만 대상이라 사용 중 자산의 보유자 변경 경로가 실제로 없었다.)
 *  새 보유자로 소유자·부서를 갱신하고 수령(인수) 확인 대기로 두어 체인 오브 커스터디를 잇는다. 라이선스 좌석은 자산에 묶여
 *  승계자에게 그대로 넘어간다(회수와 달리 반납하지 않음). 사용 중 자산만·다른 사용자로만. 자산담당·Admin. */
export async function reassignAsset(assetNo: string, rawNewOwner: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '자산 재배정 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '사용중') return { ok: false, message: `사용 중 자산만 재배정할 수 있습니다 — ${assetNo} (${asset.status})` }
  const user = s.users.find((u) => u.name === rawNewOwner.trim())
  if (!user) return { ok: false, message: '재배정 대상 사용자를 선택해 주세요.' }
  if (user.name === asset.owner) return { ok: false, message: '현재 보유자와 동일한 사용자입니다.' }
  const note = rawNote.trim()
  const from = `${asset.owner} (${asset.dept})`
  asset.owner = user.name
  asset.dept = user.dept
  asset.receiptPending = true // 새 보유자 수령(인수) 확인 대기 — 체인 오브 커스터디
  asset.history.push({ date: today(), kind: '이동', detail: `재배정(직접 인계) — ${from} → ${user.name} (${user.dept})${note ? ` · ${note}` : ''}`, actor: session.name })
  // 라이선스 좌석 보유자 승계 — 좌석은 회수하지 않고 자산과 함께 새 보유자에게 넘어가므로(로56) 배정 대장의 보유자·부서를 갱신한다(SAM 감사 정합).
  const moved = transferLicenseSeats(assetNo, user.name, user.dept, session.name)
  if (moved.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 보유자 승계 — ${moved.join(', ')} → ${user.name}`, actor: session.name })
  dispatch({ channel: '이메일', to: `${user.name} (${user.dept})`, subject: `자산 인수 요청 — ${asset.assetNo} ${asset.model} 재배정 · 수령(인수) 확인 요망`, kind: '수령 확인', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 재배정 — ${asset.model} (${from} → ${user.name})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 재배정 — ${from} → ${user.name} (${user.dept}) · 새 보유자 수령 확인 대기${moved.length ? ` · 라이선스 좌석 ${moved.length}건 승계` : ''}` }
}

/** 자산 일괄 회수 — 여러 사용 중 자산을 한 번에 회수(오프보딩: 퇴직자 보유 자산 전량 회수). 사용 중이 아닌 선택분은 건너뛴다.
 *  대장에서 소유자로 검색·선택해 일괄 회수하면 퇴직자 자산 회수를 한 번에 처리할 수 있다. 자산담당·Admin. */
export async function recoverManyFromUser(assetNos: string[], rawReason: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '자산 회수 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const reason = rawReason.trim()
  let n = 0
  for (const no of assetNos) {
    const asset = s.assets.find((a) => a.assetNo === no)
    if (!asset || asset.status !== '사용중') continue
    const holder = asset.owner
    asset.status = '반납대기'
    asset.history.push({ date: today(), kind: '반납', detail: `자산 회수(반납 처리) — ${holder} 보유분 일괄 회수${reason ? ` · ${reason}` : ''} (오프보딩·재배정)`, actor: session.name })
    const freed = reclaimLicenseSeats(no, session.name, '오프보딩 일괄 회수')
    if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (오프보딩)`, actor: session.name })
    asset.receiptPending = undefined // 미확인 수령 대기 해제 (스테일 수령 미확인 방지)
    if (holder && holder !== '미지정' && holder !== '-') {
      dispatch({ channel: '이메일', to: `${holder} (${asset.dept})`, subject: `자산 회수 — ${asset.assetNo} ${asset.model} 반납 처리${reason ? ` (${reason})` : ''}`, kind: '반납 접수', ref: asset.assetNo })
    }
    n += 1
  }
  if (n === 0) return { ok: false, message: '회수 대상(사용 중)이 없습니다 — 선택 항목을 확인하세요.' }
  appendAudit({ actor: session.name, action: `자산 일괄 회수(반납 처리) ${n}건${reason ? ` · ${reason}` : ''}`, target: '오프보딩·재배정' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${n}건 회수 — 반납 접수 대기열로 편성 (점검 후 유휴 풀/수리/폐기)` }
}

/** 자산 일괄 재배정(직접 인계) — 여러 사용 중 자산을 한 번에 같은 새 보유자에게 직접 인계한다(팀 인수인계·후임 승계·조직 개편).
 *  회수(recoverManyFromUser)가 반납 점검을 거쳐 유휴로 돌리는 오프보딩이라면, 이쪽은 실물이 창고로 돌아가지 않고 보유자만
 *  바뀌는 직접 인계(reassignAsset)의 배치 판이다. 사용 중이 아니거나 이미 대상 보유자인 선택분은 건너뛴다. 좌석은 자산과 함께
 *  승계하고 새 보유자에게 수령(인수) 확인 대기를 건다(체인 오브 커스터디). 자산담당·Admin. */
export async function reassignAssetMany(assetNos: string[], rawNewOwner: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '자산 재배정 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const user = s.users.find((u) => u.name === rawNewOwner.trim())
  if (!user) return { ok: false, message: '재배정 대상 사용자를 선택해 주세요.' }
  const note = rawNote.trim()
  let n = 0
  let seats = 0
  for (const no of assetNos) {
    const asset = s.assets.find((a) => a.assetNo === no)
    if (!asset || asset.status !== '사용중') continue
    if (asset.owner === user.name) continue // 이미 대상 보유자 — 건너뜀(단건 reassignAsset 의 동일 보유자 차단과 동형)
    const from = `${asset.owner} (${asset.dept})`
    asset.owner = user.name
    asset.dept = user.dept
    asset.receiptPending = true // 새 보유자 수령(인수) 확인 대기 — 체인 오브 커스터디
    asset.history.push({ date: today(), kind: '이동', detail: `재배정(직접 인계) — ${from} → ${user.name} (${user.dept}) 일괄${note ? ` · ${note}` : ''}`, actor: session.name })
    const moved = transferLicenseSeats(no, user.name, user.dept, session.name)
    if (moved.length) {
      asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 보유자 승계 — ${moved.join(', ')} → ${user.name}`, actor: session.name })
      seats += moved.length
    }
    dispatch({ channel: '이메일', to: `${user.name} (${user.dept})`, subject: `자산 인수 요청 — ${asset.assetNo} ${asset.model} 재배정 · 수령(인수) 확인 요망`, kind: '수령 확인', ref: asset.assetNo })
    n += 1
  }
  if (n === 0) return { ok: false, message: '재배정 대상(사용 중·다른 보유자)이 없습니다 — 선택 항목을 확인하세요.' }
  appendAudit({ actor: session.name, action: `자산 일괄 재배정 ${n}건 → ${user.name} (${user.dept})${note ? ` · ${note}` : ''}`, target: '인수인계·후임 승계' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${n}건 재배정 — → ${user.name} (${user.dept}) · 새 보유자 수령 확인 대기${seats ? ` · 라이선스 좌석 ${seats}건 승계` : ''}` }
}

/** 정기 점검 완료 — 예방 정비를 시행하고 다음 점검을 재예약한다(§03 유지보수: 사전 정비).
 *  반응형 수리(장애·반납)와 별개로, 정비 일정이 도래한 자산의 점검을 기록하고 완료일 기준 12개월 후로 다음 예정일을 잡는다.
 *  이력에 점검 사실을 남겨 정비 주기를 추적한다. 정기 점검 예정이 있는 자산만 대상. 자산담당·Admin. */
export async function recordMaintenance(assetNo: string, rawNote: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '정기 점검 처리 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (!asset.maintenanceDue) return { ok: false, message: '정기 점검 예정이 없는 자산입니다.' }
  const note = rawNote.trim()
  const t = today()
  const prevDue = asset.maintenanceDue
  // 완료일 기준 12개월 후(연 1회 정비)로 재예약 — addYears 가 TZ 없이 같은 월·일로, 없는 날(2/29)은 말일로 당긴다
  const nextDue = addYears(t, 1)
  asset.maintenanceDue = nextDue
  asset.history.push({ date: t, kind: '점검', detail: `정기 점검 완료 — 예정 ${prevDue}${note ? ` · ${note}` : ''} · 다음 예정 ${nextDue}`, actor: session.name })
  appendAudit({ actor: session.name, action: `정기 점검 완료 — ${asset.model} (다음 ${nextDue})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 정기 점검 완료 — 다음 점검 ${nextDue}로 재예약` }
}

/** 정기 점검(예방 정비) 일정 등록·변경 — 자산을 예방 정비 사이클에 편입한다(제품안내서 §03 점검).
 *  (정기 점검 완료는 다음 회차를 자동 재예약하지만, 최초 편입 경로가 없어 시드 자산 외에는
 *   예방 정비를 시작할 수 없었다. 신규 서버·핵심 자산을 도입 시점에 정비 일정에 올리는 접점.)
 *  예정일을 등록하면 도래(30일 내·경과) 시 대장 필터·상세·대시보드 큐에 드러나 정기 점검 완료로 이어진다.
 *  이미 예정이 있으면 변경(재조정)으로 처리한다. 폐기 대상은 제외. 자산담당·Admin. */
export async function scheduleMaintenance(assetNo: string, rawDate: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '정기 점검 일정 등록 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (['폐기완료', '폐기예정'].includes(asset.status)) return { ok: false, message: '폐기 대상 자산은 정기 점검 일정을 등록할 수 없습니다.' }
  const due = rawDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, message: '점검 예정일을 YYYY-MM-DD 형식으로 입력하세요.' }
  const t = today()
  if (due <= t) return { ok: false, message: '점검 예정일은 오늘 이후로 지정하세요.' }
  const prevDue = asset.maintenanceDue
  asset.maintenanceDue = due
  const verb = prevDue ? `일정 변경 — 기존 ${prevDue}${due}` : `일정 등록 — ${due}`
  asset.history.push({ date: t, kind: '점검', detail: `정기 점검(예방 정비) ${verb}`, actor: session.name })
  appendAudit({ actor: session.name, action: `정기 점검 ${prevDue ? '일정 변경' : '일정 등록'} — ${asset.model} (${due})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 정기 점검 ${prevDue ? '일정을 변경' : '일정을 등록'}했습니다 — 예정 ${due}` }
}

/** 정기 점검 예약 취소 — 잘못 잡았거나 정비 대상에서 뺄 자산의 예방 정비 예정을 완료 처리 없이 해제한다.
 *  (그동안 예약을 되돌릴 경로가 없어, 오예약을 지우려면 하지도 않은 점검을 완료 처리(recordMaintenance)해야 했다 —
 *   가짜 점검 이력이 남는 문제. 장애 신고 취소(cancelFault)와 같은 오조작 되돌리기.) 예정이 있는 자산만 대상. 자산담당·Admin. */
export async function cancelMaintenanceSchedule(assetNo: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '정기 점검 예약 취소 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (!asset.maintenanceDue) return { ok: false, message: '예약된 정기 점검이 없습니다.' }
  const prevDue = asset.maintenanceDue
  asset.maintenanceDue = undefined
  asset.history.push({ date: today(), kind: '점검', detail: `정기 점검(예방 정비) 예약 취소 — 기존 예정 ${prevDue}`, actor: session.name })
  appendAudit({ actor: session.name, action: `정기 점검 예약 취소 — ${asset.model} (기존 ${prevDue})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 정기 점검 예약을 취소했습니다 — 정비 사이클·점검 도래 큐에서 제외` }
}

/** 정기 점검 일괄 예약 — 선택한 다수 자산에 같은 예방 정비 예정일을 한 번에 등록/변경한다.
 *  (그동안 정기 점검 예약은 자산 하나씩만 가능해, 신규 서버 랙·핵심 단말 묶음을 도입 시 일정에 올리려면 반복 작업이었다.
 *   보증 일괄 연장·일괄 회수와 같은 배치 운영 접점.) 폐기 대상·미존재는 건너뛴다. 자산담당·Admin. */
export async function scheduleMaintenanceMany(assetNos: string[], rawDate: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '정기 점검 일정 등록 권한이 없습니다 (자산담당·Admin).' }
  if (!Array.isArray(assetNos) || assetNos.length === 0) return { ok: false, message: '점검 예약할 자산을 선택하세요.' }
  const due = rawDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, message: '점검 예정일을 YYYY-MM-DD 형식으로 입력하세요.' }
  const t = today()
  if (due <= t) return { ok: false, message: '점검 예정일은 오늘 이후로 지정하세요.' }

  const s = getStore()
  let done = 0
  let skipped = 0
  for (const no of assetNos) {
    const asset = s.assets.find((a) => a.assetNo === no)
    if (!asset || ['폐기완료', '폐기예정'].includes(asset.status)) { skipped += 1; continue }
    const prevDue = asset.maintenanceDue
    asset.maintenanceDue = due
    asset.history.push({ date: t, kind: '점검', detail: `정기 점검(예방 정비) ${prevDue ? `일정 변경 — 기존 ${prevDue}${due}` : `일정 등록 — ${due}`} (일괄)`, actor: session.name })
    done += 1
  }
  if (done === 0) return { ok: false, message: '점검 예약 대상이 없습니다 (폐기 자산 제외).' }
  appendAudit({ actor: session.name, action: `정기 점검 일괄 예약 (${done}건 · ${due})${skipped ? ` · 제외 ${skipped}` : ''}`, target: '자산 대장' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `정기 점검 일괄 예약 — ${done}건 예정 ${due}${skipped ? ` (폐기 ${skipped}건 제외)` : ''}` }
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

/** 수령 확인 독촉 — 불출 후 인수 확인이 안 된 자산의 소유자(사용자)에게 수령 확인 요청을 발송한다.
 *  (반환 독촉·필독 미확인 안내와 같은 컴플라이언스 독촉 — 수령 미확인이 표시로만 끝나지 않게 독촉 수단을 준다.)
 *  당일 중복 발송(독촉)은 차단한다. 자산담당·Admin. */
export async function remindReceipts() {
  const session = await guard()
  if (!session) return { ok: false, message: '수령 확인 독촉 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const t = today()
  // ref=자산번호, 독촉 메일만(수령 확인 통보와 구분) — 당일 이미 독촉한 자산은 건너뛴다
  const sentToday = new Set(s.dispatches.filter((m) => m.kind === '수령 확인' && m.subject.includes('독촉') && m.at.startsWith(t)).map((m) => m.ref))
  let n = 0
  for (const a of s.assets) {
    if (!a.receiptPending || a.status !== '사용중' || sentToday.has(a.assetNo)) continue // 사용중(현 보유자 보유) 자산만 독촉 — 수리중·폐기예정 등으로 이탈한 자산에 오독촉 방지
    dispatch({ channel: '이메일', to: `${a.owner} (${a.dept})`, subject: `자산 수령 확인 요청(독촉) — ${a.assetNo} ${a.model} 인수 확인 부탁드립니다`, kind: '수령 확인', ref: a.assetNo })
    n += 1
  }
  if (n === 0) return { ok: false, message: '수령 확인 독촉 대상이 없습니다 (미확인 없음·오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `수령 확인 독촉 발송 (${n}건)`, target: '수령 미확인 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `수령 확인 독촉 ${n}건 발송 — 미확인 사용자에게 인수 확인 요청 (발송 이력 적재)` }
}

/** 정기 점검 독촉 — 예방 정비 예정일이 지났는데도 미시행인 자산의 소유 부서에 점검 시행 요청을 발송한다.
 *  (수령 확인·반환·필독 미확인 독촉과 같은 컴플라이언스 독촉 — 예방 정비가 예정일을 넘겨 방치되지 않게 독촉 수단을 준다.
 *   정기 점검 완료·일정 등록은 시행 접점, 이것은 경과분을 소유 부서에 상기시키는 에스컬레이션.)
 *  경과(예정일 지남) 자산만 대상(임박 D-30 은 제외), 당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function remindMaintenance() {
  const session = await guard()
  if (!session) return { ok: false, message: '정기 점검 독촉 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const t = today()
  const sentToday = new Set(s.dispatches.filter((m) => m.kind === '정기 점검 독촉' && m.at.startsWith(t)).map((m) => m.ref))
  let n = 0
  for (const a of s.assets) {
    if (!isMaintenanceOverdue(a) || sentToday.has(a.assetNo)) continue
    // 보유자 없는 자산(유휴·검수중)은 관리 부서 앞으로 — '- (부서)' 아무에게도 아닌 발송 방지(다른 owner 발송 사이트와 동일 가드).
    const to = a.owner && a.owner !== '미지정' && a.owner !== '-' ? `${a.owner} (${a.dept})` : a.dept
    dispatch({ channel: '이메일', to, subject: `정기 점검(예방 정비) 독촉 — ${a.assetNo} ${a.model} 예정 ${a.maintenanceDue} 경과, 점검 시행 부탁드립니다`, kind: '정기 점검 독촉', ref: a.assetNo })
    a.history.push({ date: t, kind: '점검', detail: `정기 점검 독촉 발송 — 예정 ${a.maintenanceDue} 경과 (${a.owner})`, actor: session.name })
    n += 1
  }
  if (n === 0) return { ok: false, message: '정기 점검 독촉 대상이 없습니다 (경과 없음·오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `정기 점검 독촉 발송 (${n}건)`, target: '정기 점검 경과 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `정기 점검 독촉 ${n}건 발송 — 예정일 경과 자산의 소유 부서에 점검 시행 요청 (발송 이력 적재)` }
}

/** EOL OS 업그레이드·교체 통보 — OS 지원 종료가 경과한 자산의 소유 부서에 업그레이드·교체 검토를 통보한다.
 *  (정기 점검·수령 확인 독촉과 같은 컴플라이언스 통보 — EOL OS 는 미패치 취약점 상시 노출원인데,
 *   그동안 대시보드·대장 필터·취약점 스코어링으로 표시만 되고 폐기(하드웨어 회수)로만 닫혀,
 *   OS 업그레이드로 살릴 수 있는 자산에 소유 부서를 움직일 조치 접점이 없었다.)
 *  운영 중(폐기 경로 제외) EOL 자산만 대상, 당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function notifyEolUpgrade() {
  const session = await guard()
  if (!session) return { ok: false, message: 'EOL 업그레이드 통보 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const t = today()
  const sentToday = new Set(s.dispatches.filter((m) => m.kind === 'EOL 업그레이드 통보' && m.at.startsWith(t)).map((m) => m.ref))
  let n = 0
  for (const a of s.assets) {
    // 운영 중 EOL 자산만 — 분실·수리중·반납대기·폐기 경로 자산 제외(대장 필터·대시보드 큐와 동일 게이트). 실물이 없거나 운영 중이 아닌 자산에 교체 통보가 나가지 않게.
    if (!isEolTarget(a.status, a.os, t) || sentToday.has(a.assetNo)) continue
    const eol = eolOsOf(a.os, t)!
    // 보유자 없는 자산(유휴·검수중)은 관리 부서 앞으로 — '- (부서)' 아무에게도 아닌 발송 방지(다른 owner 발송 사이트와 동일 가드).
    const to = a.owner && a.owner !== '미지정' && a.owner !== '-' ? `${a.owner} (${a.dept})` : a.dept
    dispatch({ channel: '이메일', to, subject: `EOL OS 업그레이드·교체 검토 요청 — ${a.assetNo} ${a.model} (${eol.label} 지원 종료 ${eol.eol}), 미패치 취약점 상시 노출`, kind: 'EOL 업그레이드 통보', ref: a.assetNo })
    a.history.push({ date: t, kind: '구성변경', detail: `EOL OS 업그레이드·교체 통보 발송 — ${eol.label} 지원 종료 ${eol.eol} (${a.owner} · ${a.dept})`, actor: session.name })
    n += 1
  }
  if (n === 0) return { ok: false, message: 'EOL 업그레이드 통보 대상이 없습니다 (지원 종료 경과 없음·오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `EOL OS 업그레이드·교체 통보 발송 (${n}건)`, target: 'EOL OS 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `EOL 업그레이드 통보 ${n}건 발송 — 지원 종료 OS 자산의 소유 부서에 업그레이드·교체 검토 요청 (발송 이력 적재)` }
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
  // 실물이 사라진 자산의 배정 라이선스 좌석을 회수한다(로56) — 폐기·반납과 같은 처리. 대체 기기에 좌석을 재배정할 수 있게 여유석으로 되돌린다.
  const freed = reclaimLicenseSeats(assetNo, session.name, type)
  if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (${type})`, actor: session.name })
  asset.receiptPending = undefined // 미확인 수령 대기 해제 — 사라진 자산은 인수 대기 대상이 아니다
  // 대여 중 자산도 분실·도난 신고 대상이라, 대여 상태 잔여 신호를 함께 정리한다 —
  // 안 그러면 사라진 자산이 반환 기한(연체 판정)·연장/반납 요청 대기 큐에 계속 뜬다.
  asset.loanDueDate = undefined
  asset.loanExtendRequest = undefined
  asset.returnRequest = undefined

  // 보유자에게 신고 사실을 통보한다 — 회수(recoverFromUser)·반납·재배정처럼 '보유 이탈'은 당사자에게 알린다.
  // 분실·도난으로 배정 자산이 회수되고 라이선스 좌석이 회수됐음을 보유자가 알아야 한다(도난의 보안운영팀 통보와 별개로 당사자 통보).
  if (asset.owner && asset.owner !== '미지정' && asset.owner !== '-') {
    dispatch({ channel: '이메일', to: `${asset.owner} (${asset.dept})`, subject: `자산 ${type} 신고 — ${asset.assetNo} ${asset.model} 분실 처리 (${note})${freed.length ? ` · 라이선스 좌석 ${freed.length}건 회수` : ''}`, kind: '분실 신고', ref: asset.assetNo })
  }

  if (type === '도난') {
    // 도난은 단말 내 데이터 유출 위험이 있어 보안운영팀에 침해 대응을 통보한다 — 시간 임계라 문자 즉시 알림 병행
    escalate({ to: '보안운영팀', subject: `${asset.assetNo} ${asset.model} 도난 신고 — 데이터 유출 위험 점검 요청 (${note})`, kind: '위협 대응', ref: asset.assetNo, sms: `${asset.assetNo} ${asset.model} 도난 — 데이터 유출 위험 점검` })
  }
  appendAudit({ actor: session.name, action: `${type} 신고 — ${asset.model} · ${note}`, target: assetNo })
  revalidatePath('/', 'layout')
  const notified = Boolean(asset.owner && asset.owner !== '미지정' && asset.owner !== '-')
  return {
    ok: true,
    message: type === '도난'
      ? `${assetNo} 도난 신고 — 분실 처리 · 보안운영팀 앞 유출 위험 점검 통보${notified ? ` · 보유자(${asset.owner}) 통보` : ''}`
      : `${assetNo} 분실 신고 — 분실 처리${notified ? ` · 보유자(${asset.owner}) 통보` : ''} (회수 시 해제, 미회수 확정 시 폐기 절차)`,
  }
}

/** 분실 회수 — 분실 신고된 자산을 되찾아 유휴 풀로 되돌린다.
 *  실물이 손에 돌아왔으므로 소유자를 비우고 검수실로 편성해 재확인 후 재배치한다(반납 정상 처리와 동형).
 *  분실 상태만 대상. 자산담당·Admin. */
export async function recoverAsset(assetNo: string, rawNote: string, condition: ReturnCondition = '정상') {
  const session = await guard()
  if (!session) return { ok: false, message: '회수 처리 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '분실') return { ok: false, message: '분실 신고된 자산만 회수할 수 있습니다.' }

  const note = rawNote.trim()
  const loc = '본사 3F 검수실'
  // 되찾은 분실 자산도 실물 상태를 점검해 가른다(반납 10·26·대여 반환 35와 동일) — 파손·훼손된 채 발견된 자산이
  //  검수 없이 바로 유휴 풀에 들어가 재불출되면 안 된다. 유휴 자산은 장애 신고(사용중 전용) 경로도 없어 수리 진입이 막힌다.
  if (condition === '폐기 권고') {
    asset.status = '폐기예정'
    if (!s.disposals.some((d) => d.assetNo === assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason: `분실 회수 점검 폐기 권고${note ? ` — ${note}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
    }
  } else if (condition === '수리 필요') {
    asset.status = '수리중'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = loc
    asset.faultNote = note || '분실 회수 점검 — 수리 필요'
  } else {
    asset.status = '유휴'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = loc
  }
  asset.history.push({ date: today(), kind: condition === '폐기 권고' ? '폐기' : condition === '수리 필요' ? '수리' : '점검', detail: `분실 자산 회수 · 상태 점검 ${condition}${note ? ` (${note})` : ''}`, actor: session.name })
  appendAudit({ actor: session.name, action: `분실 자산 회수 (${condition}) — ${asset.model}`, target: assetNo })
  revalidatePath('/', 'layout')
  const outcome = condition === '수리 필요' ? '수리중 편성 (수리 후 유휴 풀)' : condition === '폐기 권고' ? '폐기 절차 편입 (폐기예정)' : '유휴 풀 편성 (재배치 가능)'
  return { ok: true, message: `${assetNo} 분실 회수 (${condition}) — ${outcome}` }
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
