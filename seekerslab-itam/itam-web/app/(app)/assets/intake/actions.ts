'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { Asset, AssetCategory } from '@/lib/types'

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
const DEFAULT_CHECKLIST = [
  '발주 사양 일치 (CPU·메모리·디스크)',
  '외관 손상·스크래치 확인',
  '전원·부팅 정상 동작',
  '부속품 구성 (어댑터·케이블·매뉴얼)',
  'OS·보안 SW 설치 상태',
  '자산 라벨 부착 위치 확인',
]

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
    checklist: DEFAULT_CHECKLIST.map((item) => ({ item, checked: false })),
    issued: [],
    inspector: session.name,
  })

  appendAudit({ actor: session.name, action: `입고 등록 — ${m} ${qty}대 (${contract.id})`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 입고 등록 — ${m} ${qty}대 · 검수 대기열 편성` }
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
