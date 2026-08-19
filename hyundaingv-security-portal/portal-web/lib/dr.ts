/** 재해복구·업무연속성 단일 원천 — 다음 훈련 예정일·지연 판정·KPI 를 화면·export·알림(추후)이 공유한다
 *  (risk·policy 단일원천 패턴). 훈련 예정일은 저장 않고 주기·최근훈련일에서 파생(정책 재검토 주기와 동형). */
import { addMonths } from './dates'
import type { DrPlan } from './types'

/** 다음 복구훈련 예정일(YYYY-MM-DD) = 최근 훈련일 + 훈련 주기(개월). 주기 손상(비수치·0 이하)은 12개월 폴백. */
export function nextTestDue(p: DrPlan): string {
  const cycle = Number.isFinite(p.testCycleMonths) && p.testCycleMonths > 0 ? p.testCycleMonths : 12
  return addMonths(p.lastTestedAt, cycle)
}

/** 복구훈련 지연 — 다음 훈련 예정일이 지났음(주기적 복구 훈련 미이행). 정책 재검토 지연과 동형 술어
 *  (nextTestDue < today 문자열 비교, sr·risk·policy 지연과 동일 방식). */
export function isTestOverdue(p: DrPlan, today: string): boolean {
  return nextTestDue(p) < today
}

export interface DrKpis {
  total: number
  /** 복구훈련 경과(예정일 초과) — 우선 훈련 신호 */
  overdue: number
  /** 미실시(한 번도 훈련 안 함) */
  untested: number
  /** 최근 훈련 실패·부분성공 — 개선 필요 */
  failed: number
}

export function computeDrKpis(plans: DrPlan[], today: string): DrKpis {
  return {
    total: plans.length,
    overdue: plans.filter((p) => isTestOverdue(p, today)).length,
    untested: plans.filter((p) => p.lastResult === '미실시').length,
    failed: plans.filter((p) => p.lastResult === '실패' || p.lastResult === '부분성공').length,
  }
}
