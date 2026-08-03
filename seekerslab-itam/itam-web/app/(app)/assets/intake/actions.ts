'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { checklistFor } from '@/lib/intake'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextAssetNo, nextId } from '@/lib/store'
import type { Asset, AssetCategory } from '@/lib/types'

/** 입고 재검수 — 반려된 로트를 다시 검수 대기열에 올린다 (공급사 교체품 도착·반려 정정 시).
 *  체크리스트를 초기화(전 항목 미체크)해 처음부터 재검수한다. 검수 반려 로트만 대상. 자산담당·Admin. */
export async function reinspectIntakeLot(lotId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '재검수 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 로트를 찾을 수 없습니다.' }
  if (lot.status !== '검수 반려') return { ok: false, message: '검수 반려된 로트만 재검수할 수 있습니다.' }

  lot.status = '입고 대기'
  lot.checklist = lot.checklist.map((c) => ({ ...c, checked: false }))
  lot.inspector = undefined

  appendAudit({ actor: session.name, action: `입고 재검수 착수 — ${lot.model}`, target: lot.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lot.id} 재검수 — 입고 대기로 되돌려 검수 대기열에 편성했습니다.` }
}

/** 입고 검수 반려 — 불량·사양 불일치 로트를 반려하고 공급사 앞 반품/교체를 통보한다.
 *  (그동안 검수는 합격(채번)만 있고 불합격 처리가 없었다.) 채번 전 로트만 대상. 자산담당·Admin. */
export async function rejectIntakeLot(lotId: string, reason: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '검수 반려 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 로트를 찾을 수 없습니다.' }
  if (lot.status === '검수 완료' || lot.issued.length > 0) {
    return { ok: false, message: '이미 채번된 로트는 반려할 수 없습니다.' }
  }
  if (lot.status === '검수 반려') return { ok: false, message: '이미 반려된 로트입니다.' }
  const r = reason.trim()
  if (!r) return { ok: false, message: '반려 사유(불량 내용)를 입력해 주세요.' }

  lot.status = '검수 반려'
  lot.inspector = session.name
  dispatch({ channel: '이메일', to: lot.vendor, subject: `${lot.id} ${lot.model} ${lot.qty}대 입고 검수 반려 — 반품·교체 요청 (${r})`, kind: '입고 반려', ref: lot.id })
  appendAudit({ actor: session.name, action: `입고 검수 반려 — ${lot.model} · ${r}`, target: lot.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lot.id} 검수 반려 — 공급사(${lot.vendor}) 앞 반품 통보 발송` }
}

/** 신규 입고 건의 기본 검수 체크리스트 — 발주 사양·외관·전원·부속·SW·라벨 */

/** 발주 연계 입고 등록 — 구매 계약에 묶어 새 입고 건을 등록한다(도입·검수 파이프라인 진입점).
 *  (제품안내서 §03: 발주 연계 입고 → 검수 체크리스트 → 채번 → 라벨) */
export async function registerIntakeLot(contractId: string, model: string, category: AssetCategory, qty: number) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '입고 등록 권한이 없습니다 (자산담당·Admin).' }
  }

  const s = getStore()
  const contract = s.contracts.find((c) => c.id === contractId && c.kind === '구매')
  if (!contract) return { ok: false, message: '연계할 구매 계약을 선택하세요.' }
  const m = model.trim()
  if (!m) return { ok: false, message: '모델명을 입력하세요.' }
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
    return { ok: false, message: '수량은 1~1000 사이여야 합니다.' }
  }

  const id = nextId('LOT')
  s.intakeLots.unshift({
    id,
    contractId,
    model: m,
    category,
    qty,
    arrivedAt: today(),
    vendor: contract.vendor,
    status: '입고 대기',
    checklist: checklistFor(category).map((item) => ({ item, checked: false })),
    issued: [],
    inspector: session.name,
  })

  appendAudit({ actor: session.name, action: `입고 등록 — ${m} ${qty}대 (${contract.id})`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 입고 등록 — ${m} ${qty}대 · 검수 대기열 편성` }
}

/** ITSM SR·발주 연계 도입 예정 사전 등록 — 아직 도착하지 않은(발주된) 자산을 미리 등록한다.
 *  (제품안내서 §06 ITSM·구매 연동: SR·발주 정보 연계 — 도입 예정 자산 사전 등록)
 *  물리 입고 전 단계이므로 검수 체크리스트·채번은 아직 없다. 도착(markLotArrived) 시 입고 대기로 전환된다. 자산담당·Admin. */
export async function preRegisterLot(input: { contractId: string; srNo: string; model: string; category: AssetCategory; qty: number; expectedDate: string }) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '도입 예정 등록 권한이 없습니다 (자산담당·Admin).' }
  }

  const s = getStore()
  const contract = s.contracts.find((c) => c.id === input.contractId && c.kind === '구매')
  if (!contract) return { ok: false, message: '연계할 구매 계약을 선택하세요.' }
  const srNo = input.srNo.trim()
  const m = input.model.trim()
  if (!srNo) return { ok: false, message: 'SR·발주 번호를 입력하세요.' }
  if (!m) return { ok: false, message: '모델명을 입력하세요.' }
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 1000) return { ok: false, message: '수량은 1~1000 사이여야 합니다.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDate)) return { ok: false, message: '도착 예정일을 YYYY-MM-DD 로 입력하세요.' }

  const id = nextId('LOT')
  s.intakeLots.unshift({
    id, contractId: input.contractId, model: m, category: input.category, qty: input.qty,
    arrivedAt: '', vendor: contract.vendor, status: '도입 예정',
    checklist: [], issued: [], srNo, expectedDate: input.expectedDate,
  })
  appendAudit({ actor: session.name, action: `도입 예정 사전 등록 — ${m} ${input.qty}대 (SR ${srNo})`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 도입 예정 등록 — ${m} ${input.qty}대 · SR ${srNo} · 도착 예정 ${input.expectedDate}` }
}

/** 도입 예정 → 입고(도착) 처리 — 발주 자산이 실제 도착하면 검수 파이프라인에 편입한다.
 *  입고 대기로 전환하며 기본 검수 체크리스트를 부여한다(이후 검수→채번→대장). 자산담당·Admin. */
export async function markLotArrived(lotId: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '입고 처리 권한이 없습니다 (자산담당·Admin).' }
  }

  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 건을 찾을 수 없습니다.' }
  if (lot.status !== '도입 예정') return { ok: false, message: '도입 예정 건만 입고 처리할 수 있습니다.' }

  lot.status = '입고 대기'
  lot.arrivedAt = today()
  lot.checklist = checklistFor(lot.category).map((item) => ({ item, checked: false }))
  lot.inspector = session.name
  appendAudit({ actor: session.name, action: `도입 예정 입고 처리 — ${lot.model} ${lot.qty}대 (SR ${lot.srNo ?? '-'})`, target: lot.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lot.id} 입고 처리 — ${lot.model} ${lot.qty}대 · 검수 대기열 편성` }
}

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

  const year = today().slice(0, 4)
  const assetNo = nextAssetNo()

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
    warrantyEnd: `${Number(year) + 3}-${today().slice(5)}`,
    contractId: lot.contractId,
    history: [
      { date: today(), kind: '등록', detail: `${lot.contractId} 발주 연계 입고 · 검수 완료 후 채번 (${lot.id})`, actor: session.name },
    ],
  }
  s.assets.push(asset)
  lot.issued.push(assetNo)

  appendAudit({ actor: session.name, action: '자산번호 채번 · 대장 등록', target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `채번 완료 — ${assetNo}`, assetNo }
}
