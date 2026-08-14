import type { Asset, DisposalRecord } from './types'
import { STOCKED_CATEGORIES } from './types'

export type LowStock = { category: string; available: number; safetyStock: number; short: number }

/** 안전재고 경보 — 불출 가능한 유형(단말·주변기기)별 가용 재고가 안전재고 미만인 유형을 집계한다.
 *  가용 = 상태 '유휴' AND 폐기 절차(완료 제외) 미진입. 폐기 선정된 유휴 자산은 재불출 대상이 아니므로 제외한다.
 *  재고 화면 경보와 대시보드 운영 큐가 이 한 함수를 공유한다(임계값·판정 단일 출처). 서버 전용. */
export function lowStockCategories(assets: Asset[], disposals: DisposalRecord[], safetyStock: number): LowStock[] {
  const pendingDisposal = new Set(disposals.filter((d) => d.status !== '완료').map((d) => d.assetNo))
  return STOCKED_CATEGORIES.map((cat) => {
    const available = assets.filter((a) => a.category === cat && a.status === '유휴' && !pendingDisposal.has(a.assetNo)).length
    return { category: cat, available, safetyStock, short: Math.max(0, safetyStock - available) }
  }).filter((r) => r.available < r.safetyStock)
}
