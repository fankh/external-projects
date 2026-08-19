/** CMDB 의존 관계 — 자산 간 의존(dependsOn)을 그래프로 보고, 상위 장애 시 영향받는 하위 자산(blast radius)을 산출한다.
 *  자산 대장의 개별 자산을 넘어 "무엇이 무엇에 의존하는가 · 이 자산이 죽으면 무엇이 영향받는가"를 드러내는 영향 분석(§ CMDB).
 *  읽기 전용 합성 뷰 — 대장의 dependsOn 에서 결정적으로 파생. */
import { getStore } from './store'
import type { Asset } from './types'

/** 자산 운영 저하/이탈 상태 — 상위가 이 상태면 하위가 영향받는다(장애·이탈·정비). */
export function isDegraded(a: Asset): boolean {
  return ['분실', '폐기예정', '폐기완료', '수리중'].includes(a.status)
}

export interface AssetDeps {
  /** 상위 의존 — 이 자산이 직접 의존하는 자산번호 */
  upstream: string[]
  /** 직접 하위 — 이 자산에 직접 의존하는 자산번호(1-hop) */
  dependents: string[]
  /** 영향 범위(blast radius) — 이 자산 장애 시 전이적으로 영향받는 전체 하위 자산번호 */
  blastRadius: string[]
  /** 저하된 상위 — 상위 의존 중 현재 저하/이탈 상태인 자산번호(이 자산이 위험) */
  degradedUpstream: string[]
}

/** 자산 하나의 의존 관계·영향 범위를 산출한다. */
export function assetDependencies(assetNo: string): AssetDeps {
  const s = getStore()
  const self = s.assets.find((x) => x.assetNo === assetNo)
  const upstream = self?.dependsOn ?? []
  const directDependents = (no: string) => s.assets.filter((x) => (x.dependsOn ?? []).includes(no)).map((x) => x.assetNo)
  const dependents = directDependents(assetNo)
  // 전이적 하위(BFS) — 순환 방어를 위해 방문 집합 사용
  const blast = new Set<string>()
  let frontier = [...dependents]
  while (frontier.length) {
    const next: string[] = []
    for (const no of frontier) {
      if (blast.has(no)) continue
      blast.add(no)
      next.push(...directDependents(no))
    }
    frontier = next
  }
  const degradedUpstream = upstream.filter((no) => {
    const up = s.assets.find((x) => x.assetNo === no)
    return up ? isDegraded(up) : false
  })
  return { upstream, dependents, blastRadius: [...blast], degradedUpstream }
}

/** 영향 소스 — 저하/이탈 상태이면서 하위 의존 자산이 있는 자산(장애 시 blast radius > 0). 운영 리스크 큐용. */
export function impactSources(): { asset: Asset; blastRadius: string[] }[] {
  const s = getStore()
  return s.assets
    .filter((a) => isDegraded(a) && s.assets.some((x) => (x.dependsOn ?? []).includes(a.assetNo)))
    .map((a) => ({ asset: a, blastRadius: assetDependencies(a.assetNo).blastRadius }))
    .filter((x) => x.blastRadius.length > 0)
    .sort((a, b) => b.blastRadius.length - a.blastRadius.length)
}
