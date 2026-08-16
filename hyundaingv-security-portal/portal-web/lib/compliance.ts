/** 보안 컴플라이언스 KPI 단일 원천 — 종합 현황 export·추세 스냅샷이 같은 술어를 공유해 수치 불일치를
 *  구조적으로 막는다. 각 지표는 소속 화면과 동일 술어(pledge/manage·education·inspection·security-review·
 *  violation). 비율은 div-zero·false-100 방어(complianceKpiPct). */
import { currentYear, nowStamp, today } from './dates'
import { eligibleForCourse, highSevOpen, nextNo } from './store'
import type { Store } from './store'
import type { ComplianceSnapshot } from './types'

export interface ComplianceKpis {
  signedCount: number; totalPeople: number
  eduDone: number; eduSlots: number; doneCourses: number
  inspDone: number; inspPending: number; inspTotal: number
  fixFindings: number; fixDone: number; openVulns: number; highVulns: number; reviewCount: number
  vDone: number; vPending: number; vTotal: number
}

/** 조치율/이수율/서약률 등 — 분모 0 이면 0, 완주가 아니면 99 캡(Math.round 거짓 100 방지) */
export function complianceKpiPct(num: number, den: number): number {
  return den > 0 ? (num >= den ? 100 : Math.min(99, Math.round((num / den) * 100))) : 0
}

export function computeComplianceKpis(s: Store): ComplianceKpis {
  // 일반 서약률 (pledge/manage 와 동일)
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signedNames = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  const signedCount = s.people.filter((p) => signedNames.has(p.name)).length
  // 보안교육 이수율 (compliance/education 와 동일 — 과정 대상별 이수 의무자)
  const done = s.educationCourses.filter((c) => c.status === '완료')
  const eduSlots = done.reduce((sum, c) => sum + eligibleForCourse(s, c.target).length, 0)
  const eduDone = done.reduce((sum, c) => sum + eligibleForCourse(s, c.target).filter((p) => s.educationRecords.some((r) => r.courseId === c.id && r.name === p.name)).length, 0)
  // 보안성 검토 (security-review·대시보드 openFindings·highSevOpen 와 동일)
  const wf = s.securityReviews.filter((r) => r.findings > 0)
  return {
    signedCount, totalPeople: s.people.length,
    eduDone, eduSlots, doneCourses: done.length,
    inspDone: s.inspectionPlans.filter((p) => p.status === '완료').length,
    inspPending: s.inspectionPlans.filter((p) => p.status === '결과미등록').length,
    inspTotal: s.inspectionPlans.length,
    fixFindings: wf.reduce((sum, r) => sum + r.findings, 0),
    fixDone: wf.reduce((sum, r) => sum + r.fixed, 0),
    openVulns: s.securityReviews.filter((r) => r.status !== '완료').reduce((sum, r) => sum + Math.max(0, r.findings - r.fixed), 0),
    highVulns: s.securityReviews.filter((r) => r.status !== '완료').reduce((sum, r) => sum + highSevOpen(r), 0),
    reviewCount: s.securityReviews.length,
    vDone: s.violations.filter((v) => v.status === '완료').length,
    vPending: s.violations.filter((v) => v.status === '징구중').length,
    vTotal: s.violations.length,
  }
}

/** 포스처 점수를 이루는 5개 축 — 점수·화면·export 가 공유하는 단일 원천(점수는 이 축들의 평균).
 *  pct 는 축 원점수 0~100, points 는 100점 만점 기여분(pct/5, 표시용), advice 는 개선 행동. */
export interface PostureAxis {
  key: 'pledge' | 'edu' | 'fix' | 'insp' | 'risk'
  label: string
  pct: number
  points: number
  advice: string
}

/** 컴플라이언스 포스처 5개 축을 각각 산출 — compliancePostureScore 는 이 축들의 평균이다(축=점수 단일원천).
 *  서약률·이수율·조치율·점검완료율(각 pct) + 리스크(고위험 미조치 -10/건·위반 미완료 -5/건, 하한 0).
 *  발견 취약점이 없으면 조치율 축은 만점(조치 대상 없음=리스크 없음). */
export function postureAxes(k: ComplianceKpis): PostureAxis[] {
  const openV = Math.max(0, k.vTotal - k.vDone)
  const axis = (key: PostureAxis['key'], label: string, pct: number, advice: string): PostureAxis => ({
    key, label, pct, points: Math.round(pct / 5), advice,
  })
  return [
    axis('pledge', '서약률', complianceKpiPct(k.signedCount, k.totalPeople), `미서약 ${Math.max(0, k.totalPeople - k.signedCount)}명 서약 독려`),
    axis('edu', '교육 이수율', complianceKpiPct(k.eduDone, k.eduSlots), `미이수 ${Math.max(0, k.eduSlots - k.eduDone)}건 이수 안내`),
    axis('fix', '취약점 조치율', k.fixFindings > 0 ? complianceKpiPct(k.fixDone, k.fixFindings) : 100, `미조치 취약점 ${k.openVulns}건 조치`),
    axis('insp', '점검 완료율', complianceKpiPct(k.inspDone, k.inspTotal), `미완료 점검 ${Math.max(0, k.inspTotal - k.inspDone)}건 결과 등록`),
    axis('risk', '리스크 관리', Math.max(0, 100 - k.highVulns * 10 - openV * 5), `고위험 미조치 ${k.highVulns}건·미완료 위반 ${openV}건 처리`),
  ]
}

/** 포스처 점수를 끌어내리는 최약 축(개선 우선순위) — 동점이면 축 순서(서약→…→리스크)상 앞선 축. */
export function weakestPostureAxis(k: ComplianceKpis): PostureAxis {
  return postureAxes(k).reduce((min, a) => (a.pct < min.pct ? a : min))
}

/** 컴플라이언스 포스처 점수 0~100 — 경영 보고용 단일 지표. 5개 축(postureAxes)의 평균. */
export function compliancePostureScore(k: ComplianceKpis): number {
  const ax = postureAxes(k)
  return Math.round(ax.reduce((sum, a) => sum + a.pct, 0) / ax.length)
}

/** 점수 등급 라벨 — 경영 보고 색상. 90+ 양호·75+ 보통·60+ 주의·그 외 미흡. */
export function postureRating(score: number): { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' } {
  if (score >= 90) return { label: '양호', tone: 'ok' }
  if (score >= 75) return { label: '보통', tone: 'neutral' }
  if (score >= 60) return { label: '주의', tone: 'warn' }
  return { label: '미흡', tone: 'err' }
}

/** 당월 컴플라이언스 포스처 스냅샷 upsert — 수동 기록(보안점검 화면)과 일배치가 공유하는 단일 경로.
 *  같은 기간(월) 재기록은 갱신하므로 매일 호출해도 당월 1건만 유지되고 값은 최신 상태로 refresh 된다. */
export function upsertComplianceSnapshot(s: Store, by: string): ComplianceSnapshot {
  const k = computeComplianceKpis(s)
  const period = today().slice(0, 7)
  const snap = {
    period, at: nowStamp(), by,
    score: compliancePostureScore(k),
    pledgeRate: complianceKpiPct(k.signedCount, k.totalPeople),
    eduRate: complianceKpiPct(k.eduDone, k.eduSlots),
    fixRate: complianceKpiPct(k.fixDone, k.fixFindings),
    inspDone: k.inspDone, inspTotal: k.inspTotal,
    highVulns: k.highVulns, openVulns: k.openVulns,
    vDone: k.vDone, vTotal: k.vTotal,
  }
  const existing = s.complianceSnapshots.find((x) => x.period === period)
  if (existing) { Object.assign(existing, snap); return existing }
  const created: ComplianceSnapshot = { id: nextNo('CS', today().slice(0, 4), s.complianceSnapshots.map((x) => x.id)), ...snap }
  s.complianceSnapshots.push(created)
  return created
}
