/** 다가오는 컴플라이언스 일정 — 정책 재검토·복구훈련·위험 조치기한이 향후 `withinDays` 일 이내 도래(아직 경과
 *  전)인 항목을 도메인 통합·기한순으로 돌려준다. 대시보드 '경과'(count·사후 신호) 타일과 달리 '아직 늦지 않은'
 *  예정 항목을 사전 계획용으로 본다(ISMS 재검토·훈련 스케줄링). 경과분(due<today)은 제외 — 그건 경과 신호가
 *  담당한다. 날짜 파싱 불가 항목은 건너뛴다(fail-safe). 화면·집계가 이 단일 원천을 공유해 산식 drift 를 막는다. */
import { daysBetween } from './dates'
import { nextTestDue } from './dr'
import { nextReviewDue } from './policy'
import { isRiskClosed } from './risk'
import type { Store } from './store'

export interface UpcomingComplianceItem {
  /** 도래 예정일 YYYY-MM-DD */
  due: string
  /** 오늘로부터 남은 일수(>=0) */
  dday: number
  kind: '정책 재검토' | '복구훈련' | '위험 조치기한'
  label: string
  href: string
}

export function upcomingComplianceItems(s: Store, today: string, withinDays: number): UpcomingComplianceItem[] {
  const items: UpcomingComplianceItem[] = []
  const add = (due: string, kind: UpcomingComplianceItem['kind'], label: string, href: string) => {
    if (!due || due < today) return // 경과·무효 제외(경과는 대시보드 경과 신호 담당)
    const d = daysBetween(today, due)
    if (d === null || d > withinDays) return // 파싱 불가·창 밖
    items.push({ due, dday: d, kind, label, href })
  }
  for (const p of s.securityPolicies) if (p.status === '시행') add(nextReviewDue(p), '정책 재검토', p.title, '/compliance/policies')
  for (const p of s.drPlans) add(nextTestDue(p), '복구훈련', p.title, '/compliance/dr')
  for (const r of s.riskItems) if (!isRiskClosed(r) && r.dueDate) add(r.dueDate, '위험 조치기한', r.title, '/compliance/risks')
  return items.sort((a, b) => a.due.localeCompare(b.due))
}
