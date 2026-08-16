/** SR 지연·활성 판정 단일 원천 — 지연 SR 정의(완료예정일 경과 + 활성 상태)를 화면(sr/delayed)·대시보드·
 *  IT운영 종합 export·알림 배치(runDailyNotify)가 공유해, 활성 제외 상태 집합이 바뀌어도 한 곳만 고치면
 *  모든 소비처가 정합을 유지한다(과거 5중 복제 → 단일 원천). */
import { today } from './dates'
import type { Store } from './store'
import type { SrRequest, SrStatus } from './types'

/** SR 진행 집계에서 제외하는 상태 — 종결(완료·반려)·상신 전/대기(작성중·결재중)·중지(BA030014, 결재 시트).
 *  지연·활성 SR 판정의 단일 기준. */
export const SR_INACTIVE_STATUSES: readonly SrStatus[] = ['완료', '반려', '작성중', '결재중', '중지']

/** SR 이 지연 상태인지 — 완료예정일 보유 + 오늘 초과 + 활성(비종결/비대기). */
export function isSrDelayed(r: SrRequest, t: string = today()): boolean {
  return !!r.dueDate && r.dueDate < t && !SR_INACTIVE_STATUSES.includes(r.status)
}

/** 지연 SR 목록 — 화면·대시보드·export·알림 배치 공유. */
export function delayedSrs(s: Store, t: string = today()): SrRequest[] {
  return s.srRequests.filter((r) => isSrDelayed(r, t))
}

/** 재계획 가능 SR — 완료예정일 보유 + 활성(과거 지연 여부 무관). 지연내역 화면의 재계획 쓰기 가드.
 *  임의 POST 로 완료·반려·미배정(dueDate 없음) SR 의 dueDate 를 덮어써 지연목록에 오분류로 넣는 것을 막는다. */
export function isSrReplannable(r: SrRequest): boolean {
  return !!r.dueDate && !SR_INACTIVE_STATUSES.includes(r.status)
}
