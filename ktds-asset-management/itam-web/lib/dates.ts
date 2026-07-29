/** 플랫폼 기준일 — 만료 계산·신규 기록(스캔·리포트·감사 로그)의 '오늘'.
 *
 *  기본값은 **실제 현재 날짜**다. 상수로 고정하면 시간이 흐를수록 만료 잔여일이 어긋나고
 *  새로 만든 기록에 과거 날짜가 찍히므로, 데모가 조용히 낡는다.
 *  시드 데이터는 2026년 7월 말 기준으로 작성되어 있어, 실제 날짜와 함께 자연스럽게 흐른다
 *  (계약 만료 잔여일이 하루씩 줄고, 유령 자산의 무통신 기간이 길어진다).
 *
 *  특정 날짜로 고정해 시연해야 하면 `ITAM_TODAY=YYYY-MM-DD` 환경변수로 덮어쓴다.
 *  이 모듈은 서버 전용(서버 컴포넌트·서버 액션에서만 import) — 클라이언트에서 쓰면
 *  하이드레이션 불일치가 생길 수 있다.
 */
function resolveToday(): string {
  const pinned = process.env.ITAM_TODAY
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const TODAY = resolveToday()

/** 시드 데이터가 작성된 기준일 — 시드와 실제 날짜의 간격을 안내할 때 쓴다 */
export const SEED_BASE_DATE = '2026-07-29'

export function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null
  const d = new Date(dateStr).getTime()
  const t = new Date(TODAY).getTime()
  if (Number.isNaN(d)) return null
  return Math.round((d - t) / 86_400_000)
}

export function fmtAmount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}
