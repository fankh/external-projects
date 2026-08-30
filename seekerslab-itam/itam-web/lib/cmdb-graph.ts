/** CMDB 의존 그래프 — 순수 함수(스토어 비의존). 클라이언트·서버 공용.
 *  assets 배열만 받아 상위 의존·하위·전이적 영향 범위(blast radius)를 산출한다.
 *  (lib/cmdb.ts 는 이 순수 코어를 getStore 로 감싼 서버용 래퍼. node:fs 를 쓰는 store 를 클라이언트에 끌어들이지 않도록 분리.) */
import { NON_OPERATIONAL_STATUSES } from './types'
import type { Asset } from './types'

/** 자산 운영 저하/이탈 상태 — 상위가 이 상태면 하위가 영향받는다(장애·이탈·정비·NAC 격리). */
export function isDegraded(a: Asset): boolean {
  // 판정은 lib/types 의 비운영 상태 한 곳만 쓴다 — 그전에는 여기만 반납대기를 빼, 회수돼 나가는 상위 자산(반납대기)에
  //  물린 하위가 '저하된 상위' 경고·영향 소스 큐·SPOF 정렬 어디에도 안 잡혔다(상위 이탈을 하위가 모르는 사각).
  // NAC 격리(quarantinedAt)도 같은 사각이었다 — 상태는 '사용중' 그대로인데 망이 끊겨 하위는 서비스를 못 받는다.
  //  격리 집행은 보안 조치라 상태를 바꾸지 않으므로, 상태만 보면 하위 담당 부서는 상위가 끊긴 줄 모른다.
  return NON_OPERATIONAL_STATUSES.includes(a.status)
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

/** 자산 하나의 의존 관계·영향 범위를 assets 스냅샷에서 산출한다(순수). */
export function assetDependenciesFrom(assets: Asset[], assetNo: string): AssetDeps {
  const self = assets.find((x) => x.assetNo === assetNo)
  const upstream = self?.dependsOn ?? []
  const directDependents = (no: string) => assets.filter((x) => (x.dependsOn ?? []).includes(no)).map((x) => x.assetNo)
  const dependents = directDependents(assetNo)
  // 전이적 하위(BFS) — 순환 방어를 위해 방문 집합 사용.
  //  자기 자신은 영향 범위에서 뺀다 — '이 자산이 죽으면 영향받는 자산'이 정의이므로 자기 자신은 대상이 아니다.
  //  순환(A→B→A)이 있으면 방문 집합만으로는 A 가 자기 blast 에 들어가 SPOF 건수가 하나 부풀고,
  //  의존 영향 통지가 자기 부서에 자기 자산을 알리게 된다. dependsOn 은 현재 쓰기 경로가 없어(시드 전용)
  //  실제로 순환이 생기진 않지만, 정의상 틀린 값을 남겨 둘 이유는 없다 — 시드 그래프의 무결성은 스모크가 따로 고정한다.
  const blast = new Set<string>()
  let frontier = [...dependents]
  while (frontier.length) {
    const next: string[] = []
    for (const no of frontier) {
      if (no === assetNo || blast.has(no)) continue
      blast.add(no)
      next.push(...directDependents(no))
    }
    frontier = next
  }
  const byNo = new Map(assets.map((x) => [x.assetNo, x]))
  const degradedUpstream = upstream.filter((no) => { const up = byNo.get(no); return up ? isDegraded(up) : false })
  return { upstream, dependents, blastRadius: [...blast], degradedUpstream }
}
