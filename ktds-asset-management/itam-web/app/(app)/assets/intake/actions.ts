'use server'
import { revalidatePath } from 'next/cache'
import { TODAY } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { Asset } from '@/lib/types'

export async function toggleCheck(lotId: string, item: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  const c = lot?.checklist.find((x) => x.item === item)
  if (!lot || !c) return
  c.checked = !c.checked
  lot.inspector = session.name
  if (lot.status === '입고 대기') lot.status = '검수 중'
  if (lot.checklist.every((x) => x.checked)) lot.status = '검수 완료'
  else if (lot.status === '검수 완료') lot.status = '검수 중'
  revalidatePath('/', 'layout')
}

/** 자산번호 채번 — 검수 완료분에 한해 대장에 등록하고 라벨 발행 대상이 된다 */
export async function issueAssetNo(lotId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 건을 찾을 수 없습니다.' }
  if (lot.status !== '검수 완료') return { ok: false, message: '검수 체크리스트를 모두 완료해야 채번할 수 있습니다.' }
  if (lot.issued.length >= lot.qty) return { ok: false, message: '입고 수량만큼 채번이 완료되었습니다.' }

  const year = TODAY.slice(0, 4)
  const seq = s.assets.filter((a) => a.assetNo.startsWith(`AST-${year}`)).length + lot.issued.length + 1
  const assetNo = `AST-${year}-${String(seq).padStart(6, '0')}`

  const asset: Asset = {
    assetNo,
    category: lot.category,
    model: lot.model,
    serial: `SN-${assetNo.slice(-6)}`,
    status: '검수중',
    owner: '-',
    dept: '자산관리팀',
    location: '본사 3F 검수실',
    purchaseDate: lot.arrivedAt,
    warrantyEnd: `${Number(year) + 3}-${TODAY.slice(5)}`,
    contractId: lot.contractId,
    history: [
      { date: TODAY, kind: '등록', detail: `${lot.contractId} 발주 연계 입고 · 검수 완료 후 채번 (${lot.id})`, actor: session.name },
    ],
  }
  s.assets.push(asset)
  lot.issued.push(assetNo)

  s.seq += 1
  s.auditLogs.unshift({
    id: `AUD-${9000 + s.seq}`, at: `${TODAY} 10:00:00`, actor: session.name,
    action: '자산번호 채번 · 대장 등록', target: assetNo, result: '성공', ip: '10.20.31.45',
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: `채번 완료 — ${assetNo}`, assetNo }
}
