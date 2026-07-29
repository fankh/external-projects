/** 데모 기준일 — 시드 데이터와 정합 유지 */
export const TODAY = '2026-07-29'

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
