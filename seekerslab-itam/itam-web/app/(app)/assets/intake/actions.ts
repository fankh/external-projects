'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { addYears, daysUntil, isIntakeOverdue, isValidDate, today } from '@/lib/dates'
import { checklistFor } from '@/lib/intake'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextAssetNo, nextId } from '@/lib/store'
import { can } from '@/lib/perm'
import { intakeRemindTargets } from '@/lib/reminders'
import type { Asset, AssetCategory } from '@/lib/types'

/** 입고 재검수 — 반려된 로트를 다시 검수 대기열에 올린다 (공급사 교체품 도착·반려 정정 시).
 *  체크리스트를 초기화(전 항목 미체크)해 처음부터 재검수한다. 검수 반려 로트만 대상. 자산담당·Admin. */
export async function reinspectIntakeLot(lotId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '재검수 권한이 없습니다 (자산담당·Admin).' }

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

/** 반품 완료 — 교체 없이 반품·환불로 종결되는 검수 반려 로트를 마감한다. 재검수(교체품 도착)의 짝으로,
 *  교체품이 오지 않는 반려 로트를 '반품 완료'로 종결해 검수 반려 백로그(대시보드 큐)에서 뺀다. 검수 반려 로트만 대상. 자산담당·Admin. */
export async function closeReturnedLot(lotId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '반품 완료 처리 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 로트를 찾을 수 없습니다.' }
  if (lot.status !== '검수 반려') return { ok: false, message: '검수 반려된 로트만 반품 완료할 수 있습니다.' }

  lot.status = '반품 완료'
  dispatch({ channel: '이메일', to: lot.vendor, subject: `${lot.id} ${lot.model} ${lot.qty}대 반품 완료 확인 — 교체 없이 종결`, kind: '입고 반려', ref: lot.id })
  appendAudit({ actor: session.name, action: `입고 반품 완료 — ${lot.model} ${lot.qty}대 (교체 없이 종결)`, target: lot.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lot.id} 반품 완료 — 공급사(${lot.vendor}) 반품 확인·종결(검수 반려 백로그에서 제외).` }
}

/** 입고 검수 반려 — 불량·사양 불일치 로트를 반려하고 공급사 앞 반품/교체를 통보한다.
 *  (그동안 검수는 합격(채번)만 있고 불합격 처리가 없었다.) 채번 전 로트만 대상. 자산담당·Admin. */
export async function rejectIntakeLot(lotId: string, reason: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '검수 반려 권한이 없습니다 (자산담당·Admin).' }

  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 로트를 찾을 수 없습니다.' }
  // 막는 이유는 '채번이 시작됐다'이지 '검수를 마쳤다'가 아니다 — 대장에 자산이 생긴 뒤에는 그 자산부터 처리해야 하므로
  //  반려로 되돌릴 수 없다. 그런데 검수 완료라는 이유만으로 함께 막으면(채번 0건인데도) 되돌릴 길이 사라진다:
  //  체크리스트는 검수 완료 상태에서 토글이 잠기고(toggleCheck), 재검수는 '검수 반려'만 받는다. 그래서 검수를 마친 뒤
  //  결함을 발견해도 앞으로(채번) 말고는 갈 곳이 없었다(시드 IN-2606-42 가 실제로 그 상태다). 반려 → 재검수로 돌아간다.
  if (lot.issued.length > 0) {
    return { ok: false, message: `이미 채번된 로트는 반려할 수 없습니다 — ${lot.issued.length}대가 대장에 등록됐습니다(해당 자산을 폐기·반품 절차로 처리하세요).` }
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
export async function registerIntakeLot(contractId: string, model: string, category: AssetCategory, qty: number, unitCost = 0) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
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
    // 비유한(Infinity/NaN) 방어 — 발주 단가가 취득가(acquisitionCost)로 흘러 TCO·감가상각·부서비용·가치 집계를 오염하지 않게(수리비·매각대금 가드와 동일 규약). '1e309' 입력이 Infinity 로 파싱돼 UI 도달 가능.
    unitCost: Number.isFinite(unitCost) && unitCost > 0 ? Math.round(unitCost) : undefined,
  })

  appendAudit({ actor: session.name, action: `입고 등록 — ${m} ${qty}대 (${contract.id})`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 입고 등록 — ${m} ${qty}대 · 검수 대기열 편성` }
}

/** ITSM SR·발주 연계 도입 예정 사전 등록 — 아직 도착하지 않은(발주된) 자산을 미리 등록한다.
 *  (제품안내서 §06 ITSM·구매 연동: SR·발주 정보 연계 — 도입 예정 자산 사전 등록)
 *  물리 입고 전 단계이므로 검수 체크리스트·채번은 아직 없다. 도착(markLotArrived) 시 입고 대기로 전환된다. 자산담당·Admin. */
export async function preRegisterLot(input: { contractId: string; srNo: string; model: string; category: AssetCategory; qty: number; expectedDate: string; unitCost?: number }) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
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
  if (!isValidDate(input.expectedDate)) return { ok: false, message: '도착 예정일을 실재하는 날짜(YYYY-MM-DD)로 입력하세요.' }

  const id = nextId('LOT')
  s.intakeLots.unshift({
    id, contractId: input.contractId, model: m, category: input.category, qty: input.qty,
    arrivedAt: '', vendor: contract.vendor, status: '도입 예정',
    checklist: [], issued: [], srNo, expectedDate: input.expectedDate,
    // 비유한(Infinity/NaN) 방어 — registerIntakeLot 과 동일(발주 단가→취득가 오염 방지).
    unitCost: Number.isFinite(input.unitCost) && input.unitCost! > 0 ? Math.round(input.unitCost!) : undefined,
  })
  appendAudit({ actor: session.name, action: `도입 예정 사전 등록 — ${m} ${input.qty}대 (SR ${srNo})`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 도입 예정 등록 — ${m} ${input.qty}대 · SR ${srNo} · 도착 예정 ${input.expectedDate}` }
}

/** 도입 예정 → 입고(도착) 처리 — 발주 자산이 실제 도착하면 검수 파이프라인에 편입한다.
 *  입고 대기로 전환하며 기본 검수 체크리스트를 부여한다(이후 검수→채번→대장). 자산담당·Admin. */
export async function markLotArrived(lotId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
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

/** 도입 예정 취소 — 발주·SR 이 취소됐거나 잘못 등록한 도입 예정(사전 등록) 건을 도착 전에 파이프라인에서 뺀다.
 *  실물이 아직 없는 계획 단계라 되돌릴 물리 상태가 없어 로트를 제거하고(참조 없음) 취소 사실만 감사에 남긴다 —
 *  방치하면 도착 예정일 경과 시 '입고 지연' 오알림·발주처 오독촉이 계속 뜬다(도착 후 반품(rejectIntakeLot)과 구분). 도입 예정 건만 대상. 자산담당·Admin. */
export async function cancelPreRegisteredLot(lotId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '도입 예정 취소 권한이 없습니다 (자산담당·Admin).' }
  }
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 건을 찾을 수 없습니다.' }
  if (lot.status !== '도입 예정') return { ok: false, message: '도입 예정 건만 취소할 수 있습니다 (도착·검수 진행 건은 반품으로 처리).' }

  s.intakeLots = s.intakeLots.filter((l) => l.id !== lotId)
  appendAudit({ actor: session.name, action: `도입 예정 취소(발주·SR 취소) — ${lot.model} ${lot.qty}대 (SR ${lot.srNo ?? '-'} · 계약 ${lot.contractId})`, target: lot.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${lot.id} 도입 예정 취소 — ${lot.model} ${lot.qty}대 · 입고 지연 알림 대상에서 제외` }
}

/** 입고 지연 독촉 — 도착 예정일이 지난 도입 예정(발주) 로트의 발주처(공급사)에 납기 확인 요청을 보낸다.
 *  §06 ITSM·구매 연동의 납기 관리 — 대여/수리 독촉과 같은 검출→조치 패턴(입고 지연 신호 → 발주처 독촉).
 *  당일 이미 독촉한 로트는 건너뛴다(ref = 입고번호). 자산담당·Admin. */
export async function remindIntakeOverdue() {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '입고 독촉 발송 권한이 없습니다 (자산담당·Admin).' }
  }

  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — 납기 경과 + 당일 발송분 제외.
  const due = intakeRemindTargets()
  let n = 0
  for (const l of due) {
    const late = -(daysUntil(l.expectedDate!) ?? 0)
    dispatch({ channel: '이메일', to: l.vendor, subject: `[입고 지연] ${l.model} ${l.qty}대 (SR ${l.srNo ?? '-'}) — 도착 예정 ${l.expectedDate} 경과 ${late}일 · 납기 확인 요청`, kind: '입고 독촉', ref: l.id })
    n++
  }
  if (n === 0) return { ok: false, message: '입고 독촉 대상이 없습니다 (납기 경과 없음, 오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `입고 지연 독촉 발송 (${n}건)`, target: '도입 예정' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `입고 지연 독촉 ${n}건 발송 — 발주처에 납기 확인 요청 (발송 이력 적재)` }
}

export async function toggleCheck(lotId: string, item: string): Promise<{ ok: boolean; message: string }> {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '검수 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  const c = lot?.checklist.find((x) => x.item === item)
  if (!lot || !c) return { ok: false, message: '검수 항목을 찾을 수 없습니다.' }
  // 검수 반려·반품 완료된 로트(체크리스트가 그대로 남는다)를 재토글해 '검수 완료'로 되돌린 뒤 채번하면
  // 이미 반품한 물품이 대장에 유령 자산으로 등록된다 — 되돌리려면 재검수(reinspectIntakeLot)를 거쳐야 한다.
  // 거절은 화면이 읽을 수 있게 사유로 돌려준다(그동안 void 로 조용히 무시해, 눌러도 아무 일이 없었다).
  if (['검수 반려', '반품 완료'].includes(lot.status)) {
    return { ok: false, message: `${lot.status} 로트는 체크리스트를 조작할 수 없습니다 — 재검수로 입고 대기에 되돌린 뒤 진행하세요.` }
  }
  // 채번이 시작된 로트는 되돌리지 않는다 — 이미 대장에 오른 자산의 근거(검수 완료)를 사후에 무를 수 없다.
  //  아직 채번 전이라면 검수 완료여도 되돌릴 수 있어야 한다(오검수 정정). 그동안은 검수 완료를 통째로 막아
  //  아래 '완료 → 검수 중' 되돌림 분기가 닿지 않는 죽은 코드였고, 화면은 눌리는 체크박스를 계속 내줬다.
  if (lot.issued.length > 0) {
    return { ok: false, message: `이미 ${lot.issued.length}건 채번된 로트는 검수 결과를 되돌릴 수 없습니다.` }
  }
  c.checked = !c.checked
  lot.inspector = session.name
  if (lot.status === '입고 대기') lot.status = '검수 중'
  const wasComplete = lot.status === '검수 완료'
  if (lot.checklist.every((x) => x.checked)) lot.status = '검수 완료'
  else if (lot.status === '검수 완료') lot.status = '검수 중'
  // 검수 완료(채번 게이트) 전이는 감사에 남긴다 — 누가·언제 이 로트의 QC 를 통과시켰는지 중앙 이력에 남아야 한다(형제 입고 액션과 정합).
  if (lot.status === '검수 완료' && !wasComplete) {
    appendAudit({ actor: session.name, action: `검수 완료 — ${lot.model} (로트 ${lot.id}) 체크리스트 전항목 확인 · 채번 가능`, target: lot.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${item} ${c.checked ? '확인' : '확인 해제'} — ${lot.checklist.filter((x) => x.checked).length}/${lot.checklist.length} (${lot.status})` }
}

/** 자산번호 채번 — 검수 완료분에 한해 대장에 등록하고 라벨 발행 대상이 된다 */
export async function issueAssetNo(lotId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return { ok: false, message: '입고 건을 찾을 수 없습니다.' }
  if (lot.status !== '검수 완료') return { ok: false, message: '검수 체크리스트를 모두 완료해야 채번할 수 있습니다.' }
  if (lot.issued.length >= lot.qty) return { ok: false, message: '입고 수량만큼 채번이 완료되었습니다.' }

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
    // 보증은 대장이 도입일로 기록하는 날(= 입고일)부터 센다. 채번일 기준으로 잡으면 입고 후 검수·채번이 늦어진 만큼
    //  공급사 보증 기간이 실제보다 길게 기록되고(시드 IN-2606-42: 입고 06-20 → 채번 08-22 면 두 달 부풀려짐),
    //  그만큼 보증 만료 임박 알림·교체 판정에서도 늦게 잡힌다. 입고일이 비면(도입 예정) 채번일로 폴백.
    warrantyEnd: addYears(lot.arrivedAt || today(), 3),
    contractId: lot.contractId,
    // 발주 단가가 입력됐으면 실제 취득 원가로 반영(없으면 유형 표준 단가 폴백 — lib/cost)
    acquisitionCost: lot.unitCost && lot.unitCost > 0 ? lot.unitCost : undefined,
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
