/** 플랫폼 기준일·시각 — 만료 계산과 신규 기록(스캔·리포트·감사 로그)의 '지금'.
 *
 *  두 가지를 반드시 지켜야 한다.
 *
 *  1. **호출 시점에 계산한다(함수, 상수 아님).** 모듈 로드 시 상수로 굳히면 컨테이너가 며칠간
 *     떠 있는 동안 기동일이 영구히 '오늘'로 남는다.
 *  2. **표준시를 명시한다(Asia/Seoul).** 컨테이너는 보통 UTC 로 동작하므로 KST 자정~09시
 *     사이에는 날짜가 하루 뒤처진다 — 실제로 D-22 로 표시돼야 할 계약이 D-23 으로 보였다.
 *
 *  시연에서 특정 날짜를 재현하려면 `ITAM_TODAY=YYYY-MM-DD`, 표준시를 바꾸려면 `ITAM_TZ`.
 *  서버 전용 모듈 — 클라이언트에서 쓰면 하이드레이션 불일치가 생긴다.
 */
import { STALE_VERIFY_DAYS, type Asset } from '@/lib/types'

const TZ = process.env.ITAM_TZ || 'Asia/Seoul'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

/** 기준일 `YYYY-MM-DD` (기본 KST) */
export function today(): string {
  const pinned = process.env.ITAM_TODAY
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned
  return dateFmt.format(new Date())
}

/** 감사 로그·이력용 타임스탬프 `YYYY-MM-DD HH:MM:SS` (기준일 + 현재 시각) */
export function nowStamp(): string {
  return `${today()} ${timeFmt.format(new Date())}`
}

/** 목록 표시용 `YYYY-MM-DD HH:MM` (초 생략).
 *  `new Date().getHours()` 로 조립하면 프로세스 표준시(컨테이너=UTC)를 따라가 날짜는 KST,
 *  시각은 UTC 인 뒤섞인 값이 된다 — 반드시 이 함수를 쓴다. */
export function nowMinute(): string {
  return `${today()} ${timeFmt.format(new Date()).slice(0, 5)}`
}

/** 시드 데이터가 작성된 기준일 — 시드와 실제 날짜의 간격을 안내할 때 쓴다 */
export const SEED_BASE_DATE = '2026-07-29'

export function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null
  const d = new Date(dateStr).getTime()
  const t = new Date(today()).getTime()
  if (Number.isNaN(d)) return null
  return Math.round((d - t) / 86_400_000)
}

export function fmtAmount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}

/** 장기 미실측(유령 자산 후보) 판정 — 폐기 경로 자산은 제외하고, 최근 실측이 없거나
 *  STALE_VERIFY_DAYS 를 넘은 자산이면 참. 대장 필터·재물조사 편성이 같은 기준을 쓰도록 한 곳에 둔다.
 *  서버 전용(daysUntil→today 의존). 클라이언트는 서버가 계산한 목록을 받아 쓴다. */
export function isStaleVerify(a: Asset): boolean {
  if (a.status === '폐기완료' || a.status === '폐기예정') return false
  if (!a.lastVerifiedAt) return true
  return -(daysUntil(a.lastVerifiedAt) ?? 0) > STALE_VERIFY_DAYS
}

/** 대여 연체 — '대여중' 상태이고 반환 기한이 지난 자산. 대장 필터·대시보드 큐가 같은 기준을 쓴다. 서버 전용. */
export function isLoanOverdue(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  return (daysUntil(a.loanDueDate) ?? 0) < 0
}

/** 대여 반환 임박 — '대여중'이고 반환 기한이 오늘~7일 이내(아직 연체는 아님). 연체 전 사전 독촉 대상. 서버 전용. */
export function isLoanDueSoon(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  const d = daysUntil(a.loanDueDate)
  return d !== null && d >= 0 && d <= 7
}
