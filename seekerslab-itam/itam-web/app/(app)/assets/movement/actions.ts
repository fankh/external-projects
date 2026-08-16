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
  // 폐기 절차(대상 선정~소거 대기) 중인 자산은 불출할 수 없다 — 파기 예정 자산이 다시 배정되면 안 된다(가용 재고 산정과 동일 판정).
  if (s.disposals.some((d) => d.assetNo === asset.assetNo && d.status !== '완료')) {
    return { ok: false, message: `폐기 절차 중인 자산은 불출할 수 없습니다 — ${asset.assetNo} (먼저 폐기 대상 선정을 취소하세요).` }
  }

  const from = `${asset.owner} / ${asset.location}`
  asset.owner = ap.requester
  asset.dept = ap.dept
  asset.location = location
  asset.status = '사용중'
  asset.receiptPending = true // 사용자 수령(인수) 확인 대기 — 체인 오브 커스터디
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

  // 신청자에게 이동 집행 완료를 알린다 — 결재 승인(신청 접수)과 별개로, 실제 위치 변경이 반영됐음을 통보한다.
  // (불출 통보 v1.137 과 대칭 — 이동도 승인만으로는 실물이 안 움직이므로 집행 시점에 요청자 루프를 닫는다.)
  dispatch({ channel: '이메일', to: ap.requester, subject: `자산 이동 완료 — ${asset.assetNo} ${asset.model} · ${from} → ${to} (${ap.id})`, kind: '자산 이동', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 이동 처리 (${ap.id}) · 신청자 통보`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 이동 완료 — ${from} → ${to} · 신청자에게 통보 발송` }
}
