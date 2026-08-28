/** 외부 공격표면(EASM) 재탐지 주기 판정 — 제품안내서 §04 "재탐지는 도메인별 주기(스케줄러)로 자동 반복".
 *  마지막 실행 + 주기가 지났는데 재탐지가 안 돌면 외부 노출 관측에 사각이 생긴다(스케줄러 지연).
 *  외부 공격표면 화면·대시보드가 같은 판정을 공유한다(임계값 재계산 금지). */
import { addDays, daysUntil } from './dates'
import type { EasmTarget } from './types'

/** 다음 재탐지 예정일 — 마지막 실행 + 주기. 미실행이면 null.
 *  날짜 계산은 lib/dates addDays 단일 소스 — new Date(문자열) 은 시각이 붙으면 로컬로 해석돼 TZ 만큼 날짜가 밀린다. */
export function nextEasmRescan(t: EasmTarget): string | null {
  if (!t.lastRunAt) return null
  return addDays(t.lastRunAt, t.intervalDays)
}

/** 재탐지 기한 경과 여부 — 다음 예정일이 지났는데 미실행(Discovery 사각) */
export function isEasmRescanOverdue(t: EasmTarget): boolean {
  const next = nextEasmRescan(t)
  return next !== null && (daysUntil(next) ?? 0) < 0
}

/** CT 인증서 유효기간 기반 생존 추정 결과 — §04 "유효기간으로 생존 여부 추정" */
export interface CertLiveness {
  /** valid = 유효기간 내(생존 유력) · expired = 만료(생존 불명·방치 후보) */
  state: 'valid' | 'expired'
  /** 남은 유효일(양수) 또는 만료 경과일(음수) */
  days: number
  /** 유효기간으로 추정한 생존 여부. 능동 확인(alive) 전 수동 트라이애지 신호이며 생존을 확정하지 않는다 */
  aliveGuess: boolean
  /** 화면 표기 라벨 */
  label: string
}

/** CT(인증서 투명성) 채널로 수집한 인증서 유효기간으로 호스트 생존 여부를 추정한다.
 *  유효한 인증서 = 최근 갱신·운영 중 → 생존 유력, 만료 = 방치·폐기 후보 → 생존 불명.
 *  수동 수집 단계의 트라이애지 신호로, 능동 확인 전까지 생존을 확정하지 않는다(제품안내서 §04). */
export function certLiveness(certValidUntil: string | undefined, today: string): CertLiveness | null {
  if (!certValidUntil) return null
  //  today 인자로 계산 — 이 함수는 클라이언트 표(외부 공격표면 · 노출 자산)가 쓴다. 내부에서 today() 를 부르면
  //  브라우저 시계로 계산돼 서버 HTML 과 어긋난다(하이드레이션 불일치). dormantDaysOf 와 같은 규약.
  const raw = Math.round((Date.parse(certValidUntil) - Date.parse(today)) / 86_400_000)
  const days = Number.isFinite(raw) ? raw : null
  if (days === null) return null
  if (days >= 0) return { state: 'valid', days, aliveGuess: true, label: `유효 ${days}일 — 생존 유력` }
  return { state: 'expired', days, aliveGuess: false, label: `만료 ${-days}일 경과 — 생존 불명` }
}
