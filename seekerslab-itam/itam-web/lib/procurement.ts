/** 구매 계약 발주·검수 이행 현황(§03 구매 계약: 검수 연계) — 구매 계약을 그 입고 로트(intakeLots)와 대사해
 *  발주 소진률(발주 입고액 ÷ 계약액)·검수 진행·잔여 발주 여력을 산출한다. 그동안 계약↔입고 연계가 화면에 없어,
 *  만료가 임박한데 발주가 소화되지 않은 미이행 계약(집행 리스크)을 감지할 수 없었다. 읽기 전용 합성 뷰. */
import { daysUntil } from './dates'
import { getStore } from './store'

/** 발주율이 이 비율 미만이면서 만료가 임박하면 발주 미이행 위험 */
const UNDERORDER_RATE = 80
const RISK_EXPIRY_DAYS = 90

export interface ProcurementRow {
  id: string
  name: string
  vendor: string
  /** 주관부서 — 발주 이행 독촉 통보 수신 부서 */
  ownerDept: string
  end: string
  amount: number
  /** 이 계약의 입고 로트 수 */
  lots: number
  /** 발주 입고액 — 반려·반품 제외 로트의 수량 × 발주 단가 합 */
  orderedValue: number
  /** 검수 완료액 — 검수 완료 로트의 수량 × 단가 합(대금 정산 근거) */
  inspectedValue: number
  /** 발주 소진률(%) — orderedValue ÷ 계약액 */
  rate: number
  remaining: number
  pendingInspection: number
  rejected: number
  dday: number | null
  /** 발주 미이행 위험 — 발주율 저조 + 만료 임박 */
  atRisk: boolean
}

export function buildProcurement(): {
  rows: ProcurementRow[]
  atRisk: ProcurementRow[]
  totalAmount: number
  totalOrdered: number
  totalInspected: number
} {
  const s = getStore()
  const rows: ProcurementRow[] = s.contracts
    .filter((c) => c.kind === '구매' && c.status !== '해지')
    .map((c) => {
      const lots = s.intakeLots.filter((l) => l.contractId === c.id)
      const active = lots.filter((l) => l.status !== '검수 반려' && l.status !== '반품 완료')
      const orderedValue = active.reduce((n, l) => n + l.qty * (l.unitCost ?? 0), 0)
      const inspectedValue = lots.filter((l) => l.status === '검수 완료').reduce((n, l) => n + l.qty * (l.unitCost ?? 0), 0)
      const rate = c.amount > 0 ? Math.round((orderedValue / c.amount) * 100) : 0
      const dday = daysUntil(c.end)
      return {
        id: c.id,
        name: c.name,
        vendor: c.vendor,
        ownerDept: c.ownerDept,
        end: c.end,
        amount: c.amount,
        lots: lots.length,
        orderedValue,
        inspectedValue,
        rate,
        remaining: c.amount - orderedValue,
        pendingInspection: lots.filter((l) => l.status === '입고 대기' || l.status === '검수 중').length,
        rejected: lots.filter((l) => l.status === '검수 반려' || l.status === '반품 완료').length,
        dday,
        atRisk: lots.length > 0 && rate < UNDERORDER_RATE && dday !== null && dday <= RISK_EXPIRY_DAYS,
      }
    })
    .filter((r) => r.lots > 0)
    .sort((a, b) => (a.dday ?? 99_999) - (b.dday ?? 99_999))
  return {
    rows,
    atRisk: rows.filter((r) => r.atRisk),
    totalAmount: rows.reduce((n, r) => n + r.amount, 0),
    totalOrdered: rows.reduce((n, r) => n + r.orderedValue, 0),
    totalInspected: rows.reduce((n, r) => n + r.inspectedValue, 0),
  }
}
