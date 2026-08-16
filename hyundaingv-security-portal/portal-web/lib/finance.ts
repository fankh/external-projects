/** IT 투자/비용 재무 KPI 단일 원천 — 화면(invest·expense)·IT운영 종합 export 가 같은 산식(집행률·확정계획
 *  스코프 정합·div-zero 방어)을 공유해 3중 복제로 인한 수치 drift 를 구조적으로 막는다. 호출자가 종류(투자·
 *  비용)별로 필터한 컬렉션을 넘긴다 — 화면과 export 가 같은 스코프로 산출하고, 화면은 넘긴 배열로 표도 그린다. */
import type { InvestContract, InvestPlan, Settlement } from './types'

export interface FinanceKpis {
  /** 확정 계획 합 (집행률 분모) */
  planTotal: number
  /** 계약액 합 (계획외 포함) */
  contractTotal: number
  /** 지급완료 집행 합 (계획외 포함) */
  paidTotal: number
  /** 확정 계획 계약의 집행 합 (집행률 분자 — 분모와 스코프 일치) */
  paidConfirmed: number
  /** 계획 대비 집행률 (%) — 분모 0 이면 0 */
  execRate: number
}

/** 재무 집행 KPI — 집행률 분자(paidConfirmed)는 분모(확정 계획)와 스코프를 맞춰 계획외·미확정 계약 집행을
 *  제외한다. 그래야 계획대비실적 표의 per-plan 집행률 합과 일치하고 100% 를 넘지 않는다. */
export function computeFinanceKpis(plans: InvestPlan[], contracts: InvestContract[], settlements: Settlement[]): FinanceKpis {
  const confirmed = plans.filter((p) => p.status === '확정')
  const planTotal = confirmed.reduce((sum, p) => sum + p.amount, 0)
  const contractTotal = contracts.reduce((sum, c) => sum + c.amount, 0)
  const paid = settlements.filter((x) => x.status === '지급완료')
  const paidTotal = paid.reduce((sum, x) => sum + x.amount, 0)
  const confirmedIds = new Set(confirmed.map((p) => p.id))
  const paidConfirmed = paid
    .filter((x) => confirmedIds.has(contracts.find((c) => c.id === x.contractId)?.planId ?? ''))
    .reduce((sum, x) => sum + x.amount, 0)
  const execRate = planTotal > 0 ? Math.round((paidConfirmed / planTotal) * 100) : 0
  return { planTotal, contractTotal, paidTotal, paidConfirmed, execRate }
}
