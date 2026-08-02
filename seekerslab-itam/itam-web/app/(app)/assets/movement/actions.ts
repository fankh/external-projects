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

/** 불출 처리 — 승인된 '자산 신청'에 유휴 재고를 배정한다.
 *  결재 승인만으로는 실물이 움직이지 않으므로, 여기서 소유자·부서·위치를 확정하고
 *  대장 상태를 사용중으로 바꾼 뒤 이력을 축적한다. (제품안내서 §03 PHASE 3) */
export async function issueAsset(approvalId: string, assetNo: string, location: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '불출 처리 권한이 없습니다.' }

  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap || ap.kind !== '자산 신청' || ap.status !== '승인') {
    return { ok: false, message: '승인된 자산 신청이 아닙니다.' }
  }
  if (ap.fulfilled) return { ok: false, message: `이미 불출 처리된 신청입니다 — ${ap.id}` }

  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (!['유휴', '검수중'].includes(asset.status)) {
    return { ok: false, message: `불출 가능한 상태가 아닙니다 — ${asset.assetNo} (${asset.status})` }
  }

  const from = `${asset.owner} / ${asset.location}`
  asset.owner = ap.requester
  asset.dept = ap.dept
  asset.location = location
  asset.status = '사용중'
  asset.history.push({
    date: today(),
    kind: '불출',
    detail: `${ap.id} 승인 불출 — ${from} → ${ap.requester} / ${location}`,
    actor: session.name,
  })

  ap.fulfilled = true
  ap.refId = asset.assetNo

  // 신청자에게 실물 지급 완료를 알린다 — 결재 승인(결재 결과)과 별개로, 실제 배정·수령 위치를 통보한다.
  dispatch({ channel: '이메일', to: ap.requester, subject: `자산 불출 완료 — ${asset.assetNo} ${asset.model} 배정 · ${location}에서 수령하세요 (${ap.id})`, kind: '자산 불출', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 불출 처리 (${ap.id}) · 신청자 통보`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 불출 완료 — ${ap.requester} / ${location} · 신청자에게 수령 안내 발송` }
}

/** 이동 처리 — 승인된 '이동' 신청의 목적지를 대장에 반영한다.
 *  승인된 이동이 집행되지 않으면 대장과 실물이 어긋나 재물조사에서 위치 불일치로 잡힌다. */
export async function moveAsset(approvalId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '이동 처리 권한이 없습니다.' }

  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap || ap.kind !== '이동' || ap.status !== '승인') {
    return { ok: false, message: '승인된 이동 신청이 아닙니다.' }
  }
  if (ap.fulfilled) return { ok: false, message: `이미 이동 처리된 신청입니다 — ${ap.id}` }

  const asset = s.assets.find((a) => a.assetNo === ap.refId)
  if (!asset) return { ok: false, message: '대상 자산을 찾을 수 없습니다.' }
  const to = ap.targetLocation
  if (!to) return { ok: false, message: '이동 목적지가 지정되지 않은 신청입니다.' }

  const from = asset.location
  asset.location = to
  asset.history.push({
    date: today(),
    kind: '이동',
    detail: `${ap.id} 승인 이동 — ${from} → ${to}`,
    actor: session.name,
  })
  ap.fulfilled = true

  appendAudit({ actor: session.name, action: `자산 이동 처리 (${ap.id})`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 이동 완료 — ${from} → ${to}` }
}
