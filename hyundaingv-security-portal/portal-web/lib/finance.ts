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
  // 집행률 표시 — 미집행(paidConfirmed<planTotal)인데 Math.round 가 99.5~99.9% 를 100% 로 올려 '완전 집행'을
  // 거짓 표기하는 것을 막는다(compliance·risk 비율의 '거짓 100 방지'와 동일 규약). 초과(>=계획)는 실값 유지(초과 신호).
  const execRate = planTotal > 0
    ? (paidConfirmed >= planTotal ? Math.round((paidConfirmed / planTotal) * 100) : Math.min(99, Math.round((paidConfirmed / planTotal) * 100)))
    : 0
  return { planTotal, contractTotal, paidTotal, paidConfirmed, execRate }
}

/** per-과제(계획) 집행률(%) — 집행<계획이면 Math.round 의 거짓 100(99.5→100)을 99 로 캡한다(집계 execRate·
 *  compliance·risk 비율의 '거짓 100 방지' 규약과 정합). 초과(집행>=계획)는 실값 유지(초과 신호). 화면(invest·
 *  expense 계획대비실적 표)·계획대비실적 export 가 이 단일 원천을 공유해 per-plan 집행률 drift·거짓 100 을 막는다.
 *  (집계 execRate 는 이미 캡됐으나 per-plan 표시가 캡을 안 해 KPI 99% 인데 유일 과제 행이 100% 로 어긋났었다.) */
export function planExecRate(paid: number, amount: number): number {
  return amount > 0
    ? (paid >= amount ? Math.round((paid / amount) * 100) : Math.min(99, Math.round((paid / amount) * 100)))
    : 0
}

export type AmountBasis = '정산' | '계약' | '계획'
export interface BasisAmount { basis: AmountBasis; amount: number }

/** 과제(계획) 표시 기준액 — 정산 > 계약 > 계획 우선순위 (요구사항 sample.xlsx: "정산>계약>계획 우선순위 적용하여 금액 표시").
 *  지급완료 정산이 있으면 정산액, 없고 계약이 있으면 계약액, 둘 다 없으면 계획액을 기준으로 삼는다.
 *  computeFinanceKpis 와 같은 스코프 규약 — 호출자가 종류(투자·비용)로 필터한 계약·정산 컬렉션을 넘긴다.
 *  이 헬퍼가 단일 원천이라 화면·export 가 같은 우선순위를 공유한다(중복 산식 drift 방지). */
export function planBasisAmount(plan: InvestPlan, contracts: InvestContract[], settlements: Settlement[]): BasisAmount {
  const ctIds = new Set(contracts.filter((c) => c.planId === plan.id).map((c) => c.id))
  const paid = settlements.filter((x) => x.status === '지급완료' && ctIds.has(x.contractId)).reduce((sum, x) => sum + x.amount, 0)
  if (paid > 0) return { basis: '정산', amount: paid }
  const contracted = contracts.filter((c) => c.planId === plan.id).reduce((sum, c) => sum + c.amount, 0)
  if (contracted > 0) return { basis: '계약', amount: contracted }
  return { basis: '계획', amount: plan.amount }
}
