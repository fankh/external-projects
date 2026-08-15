/** 외부 공격표면(EASM) 재탐지 주기 판정 — 제품안내서 §04 "재탐지는 도메인별 주기(스케줄러)로 자동 반복".
 *  마지막 실행 + 주기가 지났는데 재탐지가 안 돌면 외부 노출 관측에 사각이 생긴다(스케줄러 지연).
 *  외부 공격표면 화면·대시보드가 같은 판정을 공유한다(임계값 재계산 금지). */
import { daysUntil } from './dates'
import type { EasmTarget } from './types'

/** 다음 재탐지 예정일 — 마지막 실행 + 주기. 미실행이면 null */
export function nextEasmRescan(t: EasmTarget): string | null {
  if (!t.lastRunAt) return null
  return new Date(new Date(t.lastRunAt).getTime() + t.intervalDays * 86_400_000).toISOString().slice(0, 10)
}

/** 재탐지 기한 경과 여부 — 다음 예정일이 지났는데 미실행(Discovery 사각) */
export function isEasmRescanOverdue(t: EasmTarget): boolean {
  const next = nextEasmRescan(t)
  return next !== null && (daysUntil(next) ?? 0) < 0
}
