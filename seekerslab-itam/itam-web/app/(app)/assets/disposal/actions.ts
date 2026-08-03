'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'
import { DISPOSAL_PHOTO_LABELS, DISPOSITIONS, type Disposition, type DisposalPhotoLabel, type WipeMethod } from '@/lib/types'

/** 폐기 대상 선정 — 노후·보증만료 자산을 폐기 후보로 등록 */
export async function selectForDisposal(assetNo: string, reason: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset || s.disposals.some((d) => d.assetNo === assetNo)) return
  s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason, status: '대상 선정', prevStatus: asset.status })
  asset.status = '폐기예정'
  appendAudit({ actor: session.name, action: `폐기 대상 선정 — ${reason}`, target: assetNo })
  revalidatePath('/', 'layout')
}

/** 폐기 대상 선정 취소 — 결재 전(대상 선정) 건을 해제하고 자산을 원 상태로 복원한다.
 *  잘못 선정하거나 일괄/AI 선정을 되돌릴 때. 결재 상신·소거 진행 건은 취소 불가. 자산담당·Admin. */
export async function cancelDisposalCandidate(disposalId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '폐기 대상 취소 권한이 없습니다.' }
  const s = getStore()
  const d = s.disposals.find((x) => x.id === disposalId)
  if (!d) return { ok: false, message: '폐기 대상을 찾을 수 없습니다.' }
  if (d.status !== '대상 선정') return { ok: false, message: `결재·소거가 진행 중이라 취소할 수 없습니다 — ${d.id} (${d.status})` }

  const asset = s.assets.find((a) => a.assetNo === d.assetNo)
  if (asset) asset.status = d.prevStatus ?? '유휴'
  s.disposals = s.disposals.filter((x) => x.id !== disposalId)

  appendAudit({ actor: session.name, action: `폐기 대상 선정 취소 — ${d.assetNo} (→ ${asset?.status ?? '유휴'})`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.assetNo} 폐기 대상 선정을 취소했습니다 (${asset?.status ?? '유휴'} 복원).` }
}

/** 폐기 대상 일괄 선정 — 노후·EOL 배치를 한 번에 선정한다 (교체 계획 수십 대를 한 건씩 누르지 않도록).
 *  이미 선정됐거나 없는 자산은 건너뛰고, 실제 선정된 수만 감사에 남긴다. */
export async function selectForDisposalMany(items: { assetNo: string; reason: string }[]) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '폐기 대상 선정 권한이 없습니다.' }
  const s = getStore()
  let n = 0
  for (const it of items) {
    const asset = s.assets.find((a) => a.assetNo === it.assetNo)
    if (!asset || s.disposals.some((d) => d.assetNo === it.assetNo)) continue
    s.disposals.push({ id: nextId('DSP'), assetNo: it.assetNo, model: asset.model, reason: it.reason, status: '대상 선정', prevStatus: asset.status })
    asset.status = '폐기예정'
    n += 1
  }
  if (n === 0) return { ok: false, message: '새로 선정된 자산이 없습니다 (이미 선정되었거나 대상 아님).' }
  appendAudit({ actor: session.name, action: `폐기 대상 일괄 선정 (${n}건)`, target: '폐기' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${n}건을 폐기 대상으로 선정했습니다.` }
}

/** 폐기 결재 상신 — 필수 결재 (자산담당 → IT기획팀장) */
export async function raiseDisposalApproval() {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const targets = s.disposals.filter((d) => d.status === '대상 선정')
  if (targets.length === 0) return
  const aprId = nextApprovalId()
  s.approvals.unshift({
    id: aprId,
    kind: '폐기',
    title: `${targets[0].assetNo}${targets.length > 1 ? ` 외 ${targets.length - 1}건` : ''} 폐기 상신`,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: targets[0].assetNo,
  })
  for (const d of targets) { d.status = '결재 대기'; d.approvalId = aprId }
  appendAudit({ actor: session.name, action: `폐기 상신 (${targets.length}건)`, target: aprId })
  revalidatePath('/', 'layout')
}

/** 데이터 소거 처리 + 물리 처분 + 증적 보존 — 승인된 건만 가능 */
export async function recordWipe(id: string, method: WipeMethod, disposition: Disposition = '폐기(파쇄)', rawProceeds = 0) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  if (!DISPOSITIONS.includes(disposition)) return { ok: false, message: '처분 방식이 올바르지 않습니다.' }
  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d) return { ok: false, message: '폐기 건을 찾을 수 없습니다.' }
  if (d.status !== '소거 대기') return { ok: false, message: '폐기 결재 승인 후 소거할 수 있습니다.' }

  const proceeds = disposition === '매각' ? Math.max(0, Math.round(rawProceeds)) : 0

  s.seq += 1
  d.wipeMethod = method
  d.disposition = disposition
  if (proceeds > 0) d.proceeds = proceeds
  d.wipedAt = today()
  d.wipedBy = session.name
  d.certNo = `WIPE-${today().replace(/-/g, '')}-${String(s.seq).padStart(3, '0')}`
  // 증적 사진은 실제 등록된 기록으로 관리한다 — 여기서 지어내지 않는다(감사 무결성).
  d.evidence = `소거 확인서 ${d.certNo}`
  d.status = '완료'

  const dispLabel = `${disposition}${proceeds > 0 ? ` · 대금 ${proceeds.toLocaleString()}원` : ''}`
  const asset = s.assets.find((a) => a.assetNo === d.assetNo)
  if (asset) {
    asset.status = '폐기완료'
    asset.history.push({
      date: today(), kind: '폐기',
      detail: `데이터 소거 완료 (${method}) · 처분 ${dispLabel} · 증적 ${d.certNo} 보존`,
      actor: session.name,
    })
  }
  appendAudit({ actor: session.name, action: `폐기 데이터 소거 (${method}) · 처분 ${dispLabel}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `소거·처분 완료 (${dispLabel}) — 증적 ${d.certNo}` }
}

/** 폐기 증적 사진 등록 — 처리 전·후·폐기물 인계 등 실제 촬영 증적을 소거 완료 건에 남긴다.
 *  파일 저장은 범위 밖이므로 사진 메타데이터(구분·설명·등록자·등록일)만 관리한다 —
 *  "증적 사진이 존재한다"는 감사 주장을 실제 기록으로 뒷받침한다(제품안내서 §03 폐기: 증적(사진·확인서)). 자산담당·Admin. */
export async function addDisposalPhoto(id: string, label: DisposalPhotoLabel, rawNote: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '증적 사진 등록 권한이 없습니다 (자산담당·Admin).' }
  if (!DISPOSAL_PHOTO_LABELS.includes(label)) return { ok: false, message: '사진 구분이 올바르지 않습니다.' }

  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d) return { ok: false, message: '폐기 건을 찾을 수 없습니다.' }
  if (d.status !== '완료') return { ok: false, message: '소거 완료 건에만 증적 사진을 등록할 수 있습니다.' }
  if (!d.photos) d.photos = []
  d.photos.push({ id: nextId('PHO'), label, note: rawNote.trim() || undefined, addedAt: today(), addedBy: session.name })
  appendAudit({ actor: session.name, action: `폐기 증적 사진 등록 — ${label}${rawNote.trim() ? ` (${rawNote.trim()})` : ''}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 증적 사진 등록 — ${label}` }
}

/** 폐기 증적 사진 삭제 — 잘못 등록한 증적 항목을 제거한다. 감사 로그에 남긴다. 자산담당·Admin. */
export async function removeDisposalPhoto(id: string, photoId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '증적 사진 삭제 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d || !d.photos) return { ok: false, message: '폐기 건 또는 증적 사진을 찾을 수 없습니다.' }
  const photo = d.photos.find((p) => p.id === photoId)
  if (!photo) return { ok: false, message: '증적 사진을 찾을 수 없습니다.' }
  d.photos = d.photos.filter((p) => p.id !== photoId)
  appendAudit({ actor: session.name, action: `폐기 증적 사진 삭제 — ${photo.label}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 증적 사진 삭제 — ${photo.label}` }
}
