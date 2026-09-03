import type { Asset, DisposalRecord } from './types'
import { STOCKED_CATEGORIES } from './types'

export type LowStock = { category: string; available: number; safetyStock: number; short: number; intake: number }

/** 폐기 절차 진행 중(완료 제외) 자산번호 — 대상 선정·결재 대기·소거 대기 자산은 다시 순환시키지 않는다.
 *  불출·대여·재배치 가드(dispatchAsset·loanAsset…)와 화면의 가용/배정 가능 재고가 이 한 기준을 공유해야
 *  화면이 추천·집계한 자산을 서버가 거부하는 일이 없다. 서버 전용. */
export function pendingDisposalNos(disposals: DisposalRecord[]): Set<string> {
  return new Set(disposals.filter((d) => d.status !== '완료').map((d) => d.assetNo))
}

/** 이 자산이 폐기 절차 진행 중인가 — 위 집합의 단건 조회 형태. 판정(완료 제외)은 한 곳에서만 정한다.
 *  집행 가드들이 저마다 `disposals.some((d) => d.assetNo === x && d.status !== '완료')` 를 다시 적고 있었다.
 *  네 벌이 지금은 모두 같지만, 복사본이 넷이라는 사실 자체가 결함이다 — 한 곳이 `!== '완료'` 를 빠뜨리면
 *  이미 폐기된 자산까지 절차 중으로 보아 재불출을 막고, 반대로 조건을 넓히면 소거 대기 자산이 다시
 *  순환한다. 화면이 추천·집계한 자산을 서버가 거부하는 막다른 길도 여기서 갈린다. 서버 전용. */
export function inDisposalProcess(disposals: DisposalRecord[], assetNo: string): boolean {
  return disposals.some((d) => d.assetNo === assetNo && d.status !== '완료')
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
/** 불출 가드는 받아 주는데 '가용(유휴)'에는 안 잡히는 재고 — 도입 직후 검수중 미배정분.
 *  안전재고 경보는 즉시 재배치 가능한 유휴만 센다(availableAssets). 그런데 불출 가드(dispatchAsset)는
 *  검수중도 받는다(assignableAssets) — 그래서 경보가 '재고 소진'이라 말하는 바로 그 유형을 같은 앱의
 *  불출 화면이 배정 가능으로 내준다. 두 판정은 각자 옳다(하나는 즉시 재배치, 하나는 신규 배정 가능).
 *  어긋난 것은 그 차이를 아무 데도 적지 않은 점이다 — 발주 요청 메일이 구매팀에 실제보다 큰 부족을
 *  통보하고, 담당자는 갓 들어온 단말을 두고 새로 산다. 이 함수가 그 차이를 센다. 서버 전용. */
export function pendingIntakeStock(assets: Asset[], disposals: DisposalRecord[]): Asset[] {
  const pendingDisposal = pendingDisposalNos(disposals)
  return assets.filter((a) => a.status === '검수중' && !pendingDisposal.has(a.assetNo) && !a.quarantinedAt)
}

export function lowStockCategories(assets: Asset[], disposals: DisposalRecord[], safetyStock: number): LowStock[] {
  const avail = availableAssets(assets, disposals)
  const intakeReady = pendingIntakeStock(assets, disposals)
  return STOCKED_CATEGORIES.map((cat) => {
    const available = avail.filter((a) => a.category === cat).length
    return { category: cat, available, safetyStock, short: Math.max(0, safetyStock - available), intake: intakeReady.filter((a) => a.category === cat).length }
  }).filter((r) => r.available < r.safetyStock)
}
