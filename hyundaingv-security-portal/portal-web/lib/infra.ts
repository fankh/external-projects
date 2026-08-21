/** 인프라 운영 헬스 단일 원천 — 배치 실패·인터페이스 오류·디스크 경고를 화면(operations·systems)·대시보드·
 *  IT운영 종합 export 가 같은 술어로 산출해 수치 불일치를 구조적으로 막는다. 데이터는 전부 in-store(연동 무관). */
import type { Store } from './store'

/** 디스크 사용률 경고 임계값(%) — 초과 시 경고로 집계. 화면·대시보드·export 가 공유(중복 정의 방지). */
export const DISK_WARN = 85
/** 디스크 사용률 주의 임계값(%) — 경고 미만이나 주의로 표시(사용률 막대 warn 색). systems·operations 표가 공유. */
export const DISK_CAUTION = 70

export interface InfraHealth {
  batchTotal: number
  failedBatches: number
  ifTotal: number
  brokenIfs: number
  serverTotal: number
  diskWarns: number
}

/** 인프라 운영 3대 헬스 신호 — 배치 최근 실행 실패·인터페이스 오류·디스크 경고(>임계). 각 화면 인라인 집계를
 *  한 곳으로 모아 대시보드·종합 현황과 같은 값을 보장한다(compliance/finance 와 동일 단일-원천 패턴). */
export function computeInfraHealth(s: Store): InfraHealth {
  return {
    batchTotal: s.batchJobs.length,
    failedBatches: s.batchJobs.filter((b) => b.lastResult === '실패').length,
    ifTotal: s.interfaces.length,
    brokenIfs: s.interfaces.filter((i) => i.status === '오류').length,
    serverTotal: s.servers.length,
    diskWarns: s.servers.filter((v) => v.diskUsedPct > DISK_WARN).length,
  }
}

export interface IncidentMonthStat {
  /** 발생월 YYYY-MM */
  month: string
  /** 등급별 건수 (grades 순) */
  byGrade: Record<string, number>
  /** 월 전체 */
  total: number
  /** 월 조치완료 */
  resolved: number
}

/** 월별 장애 통계 — 발생월 × 등급 집계(제품안내서 III장 주기별 통계). 화면 통계표와 export 가 같은 술어를
 *  공유한다. grades 는 공통코드(FAULT_GRADE) + 실제 등장 등급의 합집합, months 는 최신월 우선. */
export function monthlyIncidentStats(s: Store): { grades: string[]; months: IncidentMonthStat[] } {
  const codeGrades = (s.codeGroups.find((g) => g.id === 'FAULT_GRADE')?.values ?? []).map((v) => v.code)
  const grades = [...new Set<string>([...codeGrades, ...s.incidents.map((i) => i.grade)])]
  // 무효월(손상·누락 occurredAt 의 '' 또는 부분값) 제외 — '' 는 startsWith('') 가 전건 매칭해 '' 월 행이
  // 전체 장애를 중복 집계하고, 부분값('2026')은 과대 매칭한다. 유효한 YYYY-MM 만 월 버킷으로 삼는다.
  const months = [...new Set(s.incidents.map((i) => String(i.occurredAt ?? '').slice(0, 7)))]
    .filter((month) => /^\d{4}-\d{2}$/.test(month)).sort().reverse().map((month) => {
    const rows = s.incidents.filter((i) => String(i.occurredAt ?? '').startsWith(month))
    const byGrade: Record<string, number> = {}
    for (const g of grades) byGrade[g] = rows.filter((i) => i.grade === g).length
    return { month, byGrade, total: rows.length, resolved: rows.filter((i) => i.status === '조치완료').length }
  })
  return { grades, months }
}
