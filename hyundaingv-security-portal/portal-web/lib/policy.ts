/** 정보보호 정책·지침 단일 원천 — 재검토 예정일·지연 판정·KPI 를 화면·export·알림(추후)이 같은 술어로
 *  공유한다(risk·compliance 단일원천 패턴). 재검토 예정일은 저장 않고 주기·최근검토일에서 파생. */
import { addMonths } from './dates'
import type { SecurityPolicy } from './types'

/** 재검토 예정일(YYYY-MM-DD) = 최근 재검토일 + 재검토 주기(개월). 주기 손상(비수치·0 이하)은 12개월 폴백. */
export function nextReviewDue(p: SecurityPolicy): string {
  const cycle = Number.isFinite(p.reviewCycleMonths) && p.reviewCycleMonths > 0 ? p.reviewCycleMonths : 12
  return addMonths(p.lastReviewedAt, cycle)
}

/** 재검토 지연 — 시행 중인 정책의 재검토 예정일이 지났는데 아직 재검토·개정하지 않음. 폐지·개정중은 제외
 *  (개정중은 이미 개정 작업 중, 폐지는 관리 대상 아님). dueDate < today 문자열 비교(sr·risk 지연 술어와 동일). */
export function isReviewOverdue(p: SecurityPolicy, today: string): boolean {
  return p.status === '시행' && nextReviewDue(p) < today
}

export interface PolicyKpis {
  total: number
  /** 시행중 */
  active: number
  /** 개정중 */
  revising: number
  /** 재검토 경과(시행중 + 예정일 경과) — 우선 재검토 신호 */
  overdue: number
}

export function computePolicyKpis(policies: SecurityPolicy[], today: string): PolicyKpis {
  return {
    total: policies.length,
    active: policies.filter((p) => p.status === '시행').length,
    revising: policies.filter((p) => p.status === '개정중').length,
    overdue: policies.filter((p) => isReviewOverdue(p, today)).length,
  }
}
