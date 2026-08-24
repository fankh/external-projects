/** CMDB 의존 관계(서버) — 순수 그래프 코어(cmdb-graph)를 현재 스토어로 감싼다.
 *  상위 장애 시 영향받는 하위(blast radius)·저하 상위를 대장 스냅샷에서 산출한다(§ CMDB). 읽기 전용 합성 뷰. */
import { assetDependenciesFrom, isDegraded } from './cmdb-graph'
import { today } from './dates'
import { dispatch } from './notify'
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

/** 상위 자산 이탈 통지 — 상위(이 자산)가 저하·이탈 상태로 바뀌거나 대장에서 사라질 때, 그 자산에 직접 의존하는
 *  하위 자산의 소유 부서에 영향 사실을 알린다(제품안내서 §04 CMDB 의존·영향 분석 — "변경·정비 시 사전 통지 대상").
 *  그전에는 의존 그래프가 화면·AI 답변에서 '사전 통지 대상'이라고 말만 하고 실제로 통지를 보내는 경로가 없어,
 *  상위가 회수·수리·분실·폐기로 빠져도 하위 담당 부서는 자기 자산 상세를 열어 보기 전에는 알 수 없었다.
 *  부서 단위로 한 통씩(자산번호 열거) 보내고 같은 상위·같은 부서에 대한 당일 중복 발송은 막는다(독촉 규약과 동일).
 *  반환: 통지한 부서 목록. 서버 전용. */
export function notifyDependents(assetNo: string, reason: string): string[] {
  const s = getStore()
  const upstream = s.assets.find((a) => a.assetNo === assetNo)
  const deps = s.assets.filter((a) => (a.dependsOn ?? []).includes(assetNo))
  if (!upstream || deps.length === 0) return []
  const t = today()
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '의존 영향 통지' && m.ref === assetNo && m.at.startsWith(t)).map((m) => m.to),
  )
  const byDept = new Map<string, string[]>()
  for (const d of deps) {
    const dept = d.dept || '자산관리팀'
    byDept.set(dept, [...(byDept.get(dept) ?? []), `${d.assetNo} ${d.model}`])
  }
  const notified: string[] = []
  for (const [dept, rows] of byDept) {
    if (sentToday.has(dept)) continue
    dispatch({
      channel: '이메일',
      to: dept,
      subject: `상위 의존 자산 이탈 — ${upstream.assetNo} ${upstream.model} ${reason} · 영향 자산 ${rows.length}대(${rows.join(', ')}) 점검 요청`,
      kind: '의존 영향 통지',
      ref: assetNo,
    })
    notified.push(dept)
  }
  return notified
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
