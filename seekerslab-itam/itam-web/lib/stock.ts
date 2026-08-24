import type { Asset, DisposalRecord } from './types'
import { STOCKED_CATEGORIES } from './types'

export type LowStock = { category: string; available: number; safetyStock: number; short: number }

/** 폐기 절차 진행 중(완료 제외) 자산번호 — 대상 선정·결재 대기·소거 대기 자산은 다시 순환시키지 않는다.
 *  불출·대여·재배치 가드(dispatchAsset·loanAsset…)와 화면의 가용/배정 가능 재고가 이 한 기준을 공유해야
 *  화면이 추천·집계한 자산을 서버가 거부하는 일이 없다. 서버 전용. */
export function pendingDisposalNos(disposals: DisposalRecord[]): Set<string> {
  return new Set(disposals.filter((d) => d.status !== '완료').map((d) => d.assetNo))
}

/** 재배치 가능(가용) 자산 풀 — 상태 '유휴' AND 폐기 절차(완료 제외) 미진입 AND NAC 격리 아님. 재불출·재배치의 단일 정의.
 *  폐기 선정된 유휴 자산은 재불출 대상이 아니므로 제외한다. 격리(quarantinedAt) 자산도 마찬가지다 — 망이 막혀
 *  넘겨줘도 못 쓰고, 서버 가드(loanAsset·issueAsset)가 거절하므로 가용으로 세면 재고가 실제보다 넉넉해 보인다. 안전재고 경보(lowStockCategories)와
 *  어시스턴트 '유휴 자산' 질의, 재고·반납 화면의 가용 재고 집계가 이 판정을 공유해 대수·목록이 어긋나지 않게 한다. 서버 전용. */
export function availableAssets(assets: Asset[], disposals: DisposalRecord[]): Asset[] {
  const pendingDisposal = pendingDisposalNos(disposals)
  return assets.filter((a) => a.status === '유휴' && !pendingDisposal.has(a.assetNo) && !a.quarantinedAt)
}

/** 배정(불출) 가능 재고 — 가용 유휴 재고 + 검수중(도입 직후 미배정분). 불출 가드(dispatchAsset)와 같은 판정이라
 *  불출 화면이 추천·집계한 자산을 서버가 '폐기 절차 중'·'NAC 격리 중'으로 거부하는 막다른 길이 생기지 않는다. 서버 전용. */
export function assignableAssets(assets: Asset[], disposals: DisposalRecord[]): Asset[] {
  const pendingDisposal = pendingDisposalNos(disposals)
  return assets.filter((a) => ['유휴', '검수중'].includes(a.status) && !pendingDisposal.has(a.assetNo) && !a.quarantinedAt)
}

/** 안전재고 경보 — 불출 가능한 유형(단말·주변기기)별 가용 재고가 안전재고 미만인 유형을 집계한다.
 *  가용 = availableAssets(유휴·폐기 미진입) 중 해당 유형. 재고 화면 경보와 대시보드 운영 큐가
 *  이 한 함수를 공유한다(임계값·판정 단일 출처). 서버 전용. */
export function lowStockCategories(assets: Asset[], disposals: DisposalRecord[], safetyStock: number): LowStock[] {
  const avail = availableAssets(assets, disposals)
  return STOCKED_CATEGORIES.map((cat) => {
    const available = avail.filter((a) => a.category === cat).length
    return { category: cat, available, safetyStock, short: Math.max(0, safetyStock - available) }
  }).filter((r) => r.available < r.safetyStock)
}
