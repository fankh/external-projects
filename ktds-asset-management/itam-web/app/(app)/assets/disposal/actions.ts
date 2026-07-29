'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { TODAY } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { WipeMethod } from '@/lib/types'

/** 폐기 대상 선정 — 노후·보증만료 자산을 폐기 후보로 등록 */
export async function selectForDisposal(assetNo: string, reason: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset || s.disposals.some((d) => d.assetNo === assetNo)) return
  s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason, status: '대상 선정' })
  asset.status = '폐기예정'
  revalidatePath('/', 'layout')
}

/** 폐기 결재 상신 — 필수 결재 (자산담당 → IT기획팀장) */
export async function raiseDisposalApproval() {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const targets = s.disposals.filter((d) => d.status === '대상 선정')
  if (targets.length === 0) return
  const aprId = nextId('APR-2607')
  s.approvals.unshift({
    id: aprId,
    kind: '폐기',
    title: `${targets[0].assetNo}${targets.length > 1 ? ` 외 ${targets.length - 1}건` : ''} 폐기 상신`,
    requester: session.name,
    dept: session.dept,
    requestedAt: TODAY,
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: targets[0].assetNo,
  })
  for (const d of targets) { d.status = '결재 대기'; d.approvalId = aprId }
  revalidatePath('/', 'layout')
}

/** 데이터 소거 처리 + 증적 보존 — 승인된 건만 가능 */
export async function recordWipe(id: string, method: WipeMethod) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d) return { ok: false, message: '폐기 건을 찾을 수 없습니다.' }
  if (d.status !== '소거 대기') return { ok: false, message: '폐기 결재 승인 후 소거할 수 있습니다.' }

  s.seq += 1
  d.wipeMethod = method
  d.wipedAt = TODAY
  d.wipedBy = session.name
  d.certNo = `WIPE-${TODAY.replace(/-/g, '')}-${String(s.seq).padStart(3, '0')}`
  d.evidence = `소거 확인서 ${d.certNo} · 처리 전후 사진 2매 첨부`
  d.status = '완료'

  const asset = s.assets.find((a) => a.assetNo === d.assetNo)
  if (asset) {
    asset.status = '폐기완료'
    asset.history.push({
      date: TODAY, kind: '폐기',
      detail: `데이터 소거 완료 (${method}) · 증적 ${d.certNo} 보존`,
      actor: session.name,
    })
  }
  appendAudit({ actor: session.name, action: `폐기 데이터 소거 (${method})`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `소거 완료 — 증적 ${d.certNo}` }
}
