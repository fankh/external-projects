/** 인프라 운영 헬스 단일 원천 — 배치 실패·인터페이스 오류·디스크 경고를 화면(operations·systems)·대시보드·
 *  IT운영 종합 export 가 같은 술어로 산출해 수치 불일치를 구조적으로 막는다. 데이터는 전부 in-store(연동 무관). */
import type { Store } from './store'

/** 디스크 사용률 경고 임계값(%) — 초과 시 경고로 집계. 화면·대시보드·export 가 공유(중복 정의 방지). */
export const DISK_WARN = 85

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
