/** 구매 계약 발주·검수 이행 현황(§03 구매 계약: 검수 연계) — 구매 계약을 그 입고 로트(intakeLots)와 대사해
 *  발주 소진률(발주 입고액 ÷ 계약액)·검수 진행·잔여 발주 여력을 산출한다. 그동안 계약↔입고 연계가 화면에 없어,
 *  만료가 임박한데 발주가 소화되지 않은 미이행 계약(집행 리스크)을 감지할 수 없었다. 읽기 전용 합성 뷰. */
import { ratioPct, daysUntil } from './dates'
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
  /** 정산 종결 가능 — 발주가 전량 입고·검수 완료(활성 로트 전부 검수 완료)이고 아직 미정산. 정산 종결 조치 대상 */
  settleable: boolean
  /** 정산 완료 — settledAt 이 찍힌 종결 계약(발주 이행·미이행 집계에서 제외) */
  settled: boolean
  settledAt?: string
}

export function buildProcurement(): {
  rows: ProcurementRow[]
  atRisk: ProcurementRow[]
  /** 정산 종결 가능 계약 — 전량 검수 완료·미정산(정산 종결 버튼 배지) */
  settleable: ProcurementRow[]
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
      const rate = ratioPct(orderedValue, c.amount) // 표기용 — 판정은 실발주액 비교(이정표 정직 규약)
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
        // 미이행 판정은 반올림된 rate 가 아니라 실집행액으로 — 79.6%(반올림 80%) 같은 임계 바로 아래 계약이
        // rate<80 에서 빠져 위험 큐·리포트에서 사라지던 오류 방지(미집행 rate 오분류와 동일 계열, licenseOptimization 은 raw 비율 사용).
        // 정산 종결분은 미이행 위험에서 제외(생애주기 종착).
        // 입고 로트가 하나도 없는 계약도 그대로 판정한다 — 소진률 0% 는 미이행의 극단이고, 이 뷰가 잡으려는 바로 그 상황이다.
        //  예전엔 로트가 있는 계약만 대상으로 삼아, 만료가 코앞인데 한 건도 들어오지 않은 계약이 위험 큐·독촉에서 통째로 빠졌다
        //  (아무것도 안 들어온 계약일수록 안 보이는 역설). 만료 임박(dday≤90) 조건은 그대로라 여력 있는 장기 계약은 잡히지 않는다.
        atRisk: !c.settledAt && orderedValue < (c.amount * UNDERORDER_RATE) / 100 && dday !== null && dday <= RISK_EXPIRY_DAYS,
        // 정산 종결 가능 — 발주가 전량 입고(발주 소진 완료: orderedValue≥계약액)되고 활성 로트 전부 검수 완료이며 아직 미정산.
        //  대금 정산 근거(검수 완료액) 확정 → 종결. 발주 여력이 남은(미소진) 계약은 아직 종결 대상이 아니다.
        settleable: !c.settledAt && active.length > 0 && active.every((l) => l.status === '검수 완료') && orderedValue >= c.amount,
        settled: !!c.settledAt,
        settledAt: c.settledAt,
      }
    })
    .sort((a, b) => (a.dday ?? 99_999) - (b.dday ?? 99_999))
  return {
    rows,
    atRisk: rows.filter((r) => r.atRisk),
    settleable: rows.filter((r) => r.settleable),
    totalAmount: rows.reduce((n, r) => n + r.amount, 0),
    totalOrdered: rows.reduce((n, r) => n + r.orderedValue, 0),
    totalInspected: rows.reduce((n, r) => n + r.inspectedValue, 0),
  }
}
