/** SaaS 카탈로그 판정 기한(SLA) — 검토중 항목이 판정 없이 방치되지 않도록 경과일을 산출한다.
 *  제품안내서 §01 보안담당: "Shadow IT 판정·SaaS 정책 관리" — 검토중 SaaS 는 적시에 인가/차단으로 판정해야 하며,
 *  기한 경과분은 소유자 확인 미응답과 동형으로 에스컬레이션 대상이다. 화면·대시보드가 같은 판정을 공유한다. */
import { daysUntil, today } from './dates'
import { getStore } from './store'
import type { SaasCatalogEntry } from './types'

/** 판정 기한 — 검토중 접수 후 이 일수를 넘기면 기한 경과(에스컬레이션) */
export const SAAS_REVIEW_SLA_DAYS = 7

/** 검토중 경과일(검토 시작일 기준). reviewSince 미설정이면 null */
export function saasReviewAgeDays(e: SaasCatalogEntry): number | null {
  if (!e.reviewSince) return null
  return -(daysUntil(e.reviewSince) ?? 0)
}

/** 판정 기한 경과 여부 — 검토중 + 경과일 > SLA. 접수일(reviewSince)이 없으면 경과일을 셀 수 없는데,
 *  그 경우도 기한 경과로 본다(fail safe). 예전엔 age === null 이라 false 를 돌려줬는데, 그러면 '언제부터
 *  기다렸는지도 모르는' 항목만 영영 에스컬레이션되지 않는다 — 가장 오래 방치됐을 법한 건이 큐에서 조용히
 *  빠지는 셈이다(스캔 시간대 가드를 fail closed 로 돌린 것과 같은 판단). 등재 경로는 모두 접수일을 남기므로
 *  실제로는 스냅샷·구버전 데이터에서만 생긴다. */
export function isSaasReviewOverdue(e: SaasCatalogEntry): boolean {
  if (e.status !== '검토중') return false
  const age = saasReviewAgeDays(e)
  return age === null || age > SAAS_REVIEW_SLA_DAYS
}

export function buildSaasReview(): {
  pending: SaasCatalogEntry[]
  overdue: SaasCatalogEntry[]
  /** 기한 경과 중 민감·기밀 등급 — 우선 판정 대상 */
  overdueSensitive: number
  oldestDays: number
  slaDays: number
  asOf: string
} {
  const s = getStore()
  const pending = s.saasCatalog.filter((x) => x.status === '검토중')
  const overdue = pending.filter(isSaasReviewOverdue)
  const oldestDays = pending.reduce((m, e) => Math.max(m, saasReviewAgeDays(e) ?? 0), 0)
  return {
    pending,
    overdue,
    overdueSensitive: overdue.filter((e) => e.dataGrade !== '일반').length,
    oldestDays,
    slaDays: SAAS_REVIEW_SLA_DAYS,
    asOf: today(),
  }
}
