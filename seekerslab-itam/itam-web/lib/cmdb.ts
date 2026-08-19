/** CMDB 의존 관계(서버) — 순수 그래프 코어(cmdb-graph)를 현재 스토어로 감싼다.
 *  상위 장애 시 영향받는 하위(blast radius)·저하 상위를 대장 스냅샷에서 산출한다(§ CMDB). 읽기 전용 합성 뷰. */
import { assetDependenciesFrom, isDegraded } from './cmdb-graph'
import { getStore } from './store'
import type { Asset } from './types'

export { isDegraded } from './cmdb-graph'
export type { AssetDeps } from './cmdb-graph'

/** 자산 하나의 의존 관계·영향 범위(현재 스토어 기준). */
export function assetDependencies(assetNo: string) {
  return assetDependenciesFrom(getStore().assets, assetNo)
}

/** 영향 소스 — 저하/이탈 상태이면서 하위 의존 자산이 있는 자산(장애 시 blast radius > 0). 운영 리스크 큐용. */
export function impactSources(): { asset: Asset; blastRadius: string[] }[] {
  const s = getStore()
  return s.assets
    .filter((a) => isDegraded(a) && s.assets.some((x) => (x.dependsOn ?? []).includes(a.assetNo)))
    .map((a) => ({ asset: a, blastRadius: assetDependenciesFrom(s.assets, a.assetNo).blastRadius }))
    .filter((x) => x.blastRadius.length > 0)
    .sort((a, b) => b.blastRadius.length - a.blastRadius.length)
}
