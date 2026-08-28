import { getStore } from './store'
import { isMaintenanceDue, isStaleVerify, isWarrantyExpiring, today } from './dates'
import { deptOfOwner, hasDataIssue } from './quality'
import { isEolTarget } from './eol'
import { criticalDependencies } from './cmdb'
import { replacementCandidates } from './reports'
import type { Asset } from './types'

/** 자산별 복합 위험(≥2 주의 신호) 판정 — 대장 필터(?risk=1)·자산 상세 '위험 신호' 요약·대시보드 큐·어시스턴트·복합 위험 리포트가 공유하는 단일 소스.
 *  7 신호: 정합성 미흡(hasDataIssue) · EOL OS · 보증 임박(≤운영 정책 만료창) · 정기 점검 도래 · 단일 장애점(SPOF) · 교체 대상 · 장기 미실측.
 *  각 신호는 대장 필터·패널과 같은 lib 빌더를 재사용해 임계값을 재계산하지 않는다(화면 간 정합 보장). 서버 전용.
 *  라벨 순서는 대장 상세 도시어 '위험 신호' 요약과 동일(정합성→EOL→보증→점검→SPOF→교체→미실측). */
export function riskSignals(a: Asset): string[] {
  const s = getStore()
  const t = today()
  const out: string[] = []
  if (hasDataIssue(a, deptOfOwner(s.users))) out.push('정합성 미흡')
  if (isEolTarget(a.status, a.os, t)) out.push('EOL OS')
  if (isWarrantyExpiring(a, s.opsPolicy.expiryWindowDays)) out.push('보증 임박') // 창은 운영 정책 만료창 — 대장 필터·통지와 같은 판정
  if (isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays)) out.push('정기 점검 도래')
  if (SPOF_SET().has(a.assetNo)) out.push('단일 장애점')
  if (REPLACE_SET().has(a.assetNo)) out.push('교체 대상')
  if (isStaleVerify(a, s.opsPolicy.staleVerifyDays)) out.push('장기 미실측')
  return out
}

/** 자산별 주의 신호 개수 — riskSignals 라벨 수와 동일(판정 정의는 riskSignals 한 곳). */
export function riskSignalCount(a: Asset): number {
  return riskSignals(a).length
}

// SPOF·교체 대상은 그래프/리스트 기반 전역 산출이라 자산별 반복 호출 시 캐시(한 요청 내 동일 스토어 스냅샷).
//  불변식: 이 캐시를 비우는 곳은 compositeRiskAssetNos 하나뿐이므로, riskSignals·riskSignalCount 는 반드시
//  같은 산출 단위에서 compositeRiskAssetNos 를 먼저 부른 뒤에 써야 한다. 스토어는 g.__itamStore 를 제자리
//  수정하는 싱글턴이라(getStore) 객체 정체성으로는 변경을 감지할 수 없고, 모듈 상태는 요청 사이에 살아남는다.
//  이 순서를 어기면 지난 요청의 SPOF·교체 집합으로 '위험 신호'를 붙인다 — 화면·큐·리포트가 조용히 어긋난다.
//  현재 세 소비자(어시스턴트·리포트 2곳)는 모두 지키고 있으며, 스모크가 새 소비자의 이탈을 잡는다.
let _spof: Set<string> | null = null
let _replace: Set<string> | null = null
function SPOF_SET() { return (_spof ??= new Set(criticalDependencies().map((x) => x.asset.assetNo))) }
function REPLACE_SET() { return (_replace ??= new Set(replacementCandidates().cands.map((x) => x.a.assetNo))) }

/** 복합 위험(≥2 신호) 자산번호 목록 — assets 스냅샷 기준. 캐시는 호출 단위로 초기화. */
export function compositeRiskAssetNos(assets: Asset[]): string[] {
  _spof = null; _replace = null // 이 산출 배치의 캐시 초기화(스토어 변경 반영)
  return assets.filter((a) => riskSignalCount(a) >= 2).map((a) => a.assetNo)
}
