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

/** 판정 기한 경과 여부 — 검토중 + 경과일 > SLA */
export function isSaasReviewOverdue(e: SaasCatalogEntry): boolean {
  if (e.status !== '검토중') return false
  const age = saasReviewAgeDays(e)
  return age !== null && age > SAAS_REVIEW_SLA_DAYS
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
