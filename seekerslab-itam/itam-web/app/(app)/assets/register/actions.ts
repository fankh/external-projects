'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
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
