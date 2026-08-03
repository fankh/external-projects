import type { Asset, AssetCategory } from './types'

/** 표준 취득 단가 — 실제 취득가 미입력 자산의 기본값(교체 계획 REPLACEMENT_COST 와 같은 유형별 표준 단가 방식).
 *  실물 자산만 유의미 — SW·가상자원은 구독/사용량 과금이라 자산 단위 취득가가 없다(0). */
export const ACQ_COST: Record<AssetCategory, number> = {
  단말: 1_500_000, 서버: 8_000_000, 네트워크: 3_000_000, 주변기기: 400_000, SW: 0, 가상자원: 0,
}

/** 자산 취득가 — 명시값 우선, 없으면 유형 표준 단가. */
export function acquisitionCostOf(a: Asset): number {
  return a.acquisitionCost ?? ACQ_COST[a.category] ?? 0
}

/** 누적 수리비 — repairCosts 합계. */
export function repairTotalOf(a: Asset): number {
  return (a.repairCosts ?? []).reduce((n, c) => n + c.amount, 0)
}

/** 총소유비용(TCO) — 취득가 + 누적 수리비. 자산이 운영 중 지금까지 든 비용. */
export function assetTco(a: Asset): number {
  return acquisitionCostOf(a) + repairTotalOf(a)
}

/** 내용연수(년) — 정액법 감가상각 기준. 연간 교체 계획(reports)의 도입 5년 초과 기준과 일치. */
export const USEFUL_LIFE_YEARS = 5

/** 도입 후 경과 연수 — 서버가 준 today(YYYY-MM-DD) 기준으로만 계산해 하이드레이션 불일치를 피한다. */
function elapsedYears(purchaseDate: string, today: string): number {
  const ms = Date.parse(today) - Date.parse(purchaseDate)
  return ms > 0 ? ms / (365.25 * 24 * 3600 * 1000) : 0
}

/** 감가상각 진행률(%) — 정액법. 내용연수 초과 시 100%(상각 완료). */
export function depreciationPct(a: Asset, today: string): number {
  return Math.min(100, Math.round((elapsedYears(a.purchaseDate, today) / USEFUL_LIFE_YEARS) * 100))
}

/** 잔존가치(장부가) — 취득가에서 정액법 감가상각을 적용한 현재 가치. 내용연수 초과분은 0으로 상각 완료. */
export function bookValueOf(a: Asset, today: string): number {
  const acq = acquisitionCostOf(a)
  if (acq <= 0) return 0
  const remaining = Math.max(0, USEFUL_LIFE_YEARS - elapsedYears(a.purchaseDate, today)) / USEFUL_LIFE_YEARS
  return Math.round(acq * remaining)
}
