/** 유지보수 계약 관리 현황(§03 유지보수 계약: 대상 자산·SLA·비용 이력) — 계약별 예산 집행률과 SLA 요약을
 *  한 곳에 모은다. 그동안 비용 이력은 '누계'만 보였고 계약액 대비 집행률·잔여 예산·판정이 없었다.
 *  읽기 전용 합성 뷰 — 화면과 대장이 같은 산출을 쓴다(계약 amount·costs·연계 자산에서 결정적으로 파생). */
import { ratioPct, daysUntil } from './dates'
import { getStore } from './store'

export interface MaintenanceRow {
  id: string
  name: string
  vendor: string
  /** 주관부서 — 예산 통보(재협상·집행 점검) 수신 부서 */
  ownerDept: string
  end: string
  amount: number
  spent: number
  /** 집행률(%) — 누계 지출 ÷ 계약액 */
  rate: number
  remaining: number
  /** 연계 자산 수(대장 실측 — asset.contractId 기준) */
  covered: number
  sla?: string
  /** SLA 대응 목표 일수 — 계약의 slaResponseDays 패스스루(미설정이면 undefined) */
  slaResponseDays?: number
  /** SLA 위반 — 덮는 자산 중 열린 수리가 SLA 대응 시한(slaResponseDays)을 넘긴 건수 */
  slaBreach: number
  /** SLA 위반 자산번호 — 이행 독촉 대상(공급사 앞 통보에 열거) */
  breachAssetNos: string[]
  costCount: number
  /** 판정 — 예산 초과(>100%) · 소진 임박(≥90%) · 미집행(0%) · 정상 */
  status: '예산 초과' | '소진 임박' | '미집행' | '정상'
}

export function buildMaintenance(): {
  rows: MaintenanceRow[]
  totalAmount: number
  totalSpent: number
  overBudget: number
  /** 예산 통보 대상 — 예산 초과 + 소진 임박(재협상·집행 점검 통보 버튼 배지) */
  budgetAlert: number
  /** 이행 독촉 대상 — 계약액이 있는데 집행이 전혀 없는 미집행(이행 확인 통보 버튼 배지) */
  execAlert: number
  noSla: number
  /** SLA 위반 계약 수 — 덮는 자산의 열린 수리가 SLA 대응 시한을 넘긴 계약(이행 독촉 버튼 배지) */
  slaBreachAlert: number
} {
  const s = getStore()
  const rows: MaintenanceRow[] = s.contracts
    .filter((c) => c.kind === '유지보수' && c.status !== '해지')
    .map((c) => {
      const spent = (c.costs ?? []).reduce((n, x) => n + x.amount, 0)
      const rate = ratioPct(spent, c.amount) // 표기용 — 판정은 아래 실집행액 비교가 한다(이정표 정직 규약)
      // SLA 위반 — 이 계약이 덮는 자산 중 열린 수리(수리중·repair)가 SLA 대응 목표 일수를 넘긴 건. slaResponseDays 미설정이면 판정 안 함.
      const breachAssetNos = c.slaResponseDays
        ? s.assets
            .filter((a) => a.contractId === c.id && a.status === '수리중' && a.repair && -(daysUntil(a.repair.sentAt) ?? 0) > c.slaResponseDays!)
            .map((a) => a.assetNo)
        : []
      // 초과·미집행·소진 임박 판정은 모두 반올림 rate 가 아니라 실집행액으로 — 초과는 100.0~100.5%가 반올림되어 '소진 임박'으로,
      // 미집행은 0.1%(반올림 0%)가 '미집행'으로, 소진 임박은 89.6%(반올림 90%)가 '소진 임박'으로 오분류되던 문제 방지(세 경계 동일 규칙).
      // 소진 임박 = 계약액 대비 90% 이상 집행(spent/amount ≥ 0.9, 정수배로 비교). 미집행 = 계약액 있음 + 집행 전무.
      const status: MaintenanceRow['status'] = spent > c.amount ? '예산 초과' : c.amount > 0 && spent === 0 ? '미집행' : c.amount > 0 && spent * 10 >= c.amount * 9 ? '소진 임박' : '정상'
      return {
        id: c.id,
        name: c.name,
        vendor: c.vendor,
        ownerDept: c.ownerDept,
        end: c.end,
        amount: c.amount,
        spent,
        rate,
        remaining: c.amount - spent,
        covered: s.assets.filter((a) => a.contractId === c.id).length,
        sla: c.sla,
        slaResponseDays: c.slaResponseDays,
        slaBreach: breachAssetNos.length,
        breachAssetNos,
        costCount: c.costs?.length ?? 0,
        status,
      }
    })
    .sort((a, b) => b.rate - a.rate)
  return {
    rows,
    totalAmount: rows.reduce((n, r) => n + r.amount, 0),
    totalSpent: rows.reduce((n, r) => n + r.spent, 0),
    overBudget: rows.filter((r) => r.status === '예산 초과').length,
    budgetAlert: rows.filter((r) => r.status === '예산 초과' || r.status === '소진 임박').length,
    execAlert: rows.filter((r) => r.status === '미집행').length,
    noSla: rows.filter((r) => !r.sla).length,
    slaBreachAlert: rows.filter((r) => r.slaBreach > 0).length,
  }
}
