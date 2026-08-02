'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

async function guard() {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) return null
  return session
}

/** 구성변경 대상 — 대장이 보유한 사양 필드 + 사양 외 기타 변경. */
export type ConfigField = 'os' | 'cpu' | 'memory' | '기타'
const FIELD_LABEL: Record<ConfigField, string> = { os: 'OS', cpu: 'CPU', memory: '메모리', 기타: '기타' }

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

  if (field === '기타') {
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
    // 도난은 단말 내 데이터 유출 위험이 있어 보안운영팀에 침해 대응을 통보한다
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `${asset.assetNo} ${asset.model} 도난 신고 — 데이터 유출 위험 점검 요청 (${note})`, kind: '위협 대응', ref: asset.assetNo })
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
