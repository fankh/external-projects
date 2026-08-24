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

/** 폐기 완료 자산을 가리키는 의존 참조 정리 — 소거·처분으로 자산이 사라지면 그 자산을 상위로 두던
 *  하위 자산의 dependsOn 이 실재하지 않는 대상을 가리킨 채 남는다. 그 유령 참조는 사라진 자산을
 *  '단일 장애점(SPOF)'으로 계속 세우고(criticalDependencies 는 blast radius 만 본다), 폐기완료는 isDegraded 라
 *  '저하 상태 SPOF'로 큐 맨 위까지 올라간다 — 없는 장비에 이중화를 하라는 조치 지시가 된다.
 *  라이선스 좌석 자동 회수(reclaimLicenseSeats)와 같은 폐기 시 참조 정리 규약. 정리된 하위 자산번호를 돌려준다. 서버 전용. */
export function clearDependencyRefs(assetNo: string): string[] {
  const s = getStore()
  const cleared: string[] = []
  for (const a of s.assets) {
    if (!(a.dependsOn ?? []).includes(assetNo)) continue
    a.dependsOn = (a.dependsOn ?? []).filter((no) => no !== assetNo)
    cleared.push(a.assetNo)
  }
  return cleared
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

/** 영향 집중 자산(단일 장애점·SPOF) — 이 자산이 장애나면 전이적으로 minBlast 대 이상이 영향받는 자산.
 *  장애 대비·이중화 우선순위 근거(대시보드 blast radius 큐). degraded=현재 저하 상태(즉시 리스크). */
export function criticalDependencies(minBlast = 2): { asset: Asset; blastRadius: string[]; degraded: boolean }[] {
  const s = getStore()
  return s.assets
    .map((a) => ({ a, deps: assetDependenciesFrom(s.assets, a.assetNo) }))
    .filter((x) => x.deps.blastRadius.length >= minBlast)
    .map((x) => ({ asset: x.a, blastRadius: x.deps.blastRadius, degraded: isDegraded(x.a) }))
    .sort((a, b) => Number(b.degraded) - Number(a.degraded) || b.blastRadius.length - a.blastRadius.length)
}
