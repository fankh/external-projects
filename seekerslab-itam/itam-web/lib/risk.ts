import { getStore } from './store'
import { daysUntil, isMaintenanceDue, isStaleVerify, today } from './dates'
import { hasDataIssue } from './quality'
import { isEolTarget } from './eol'
import { criticalDependencies } from './cmdb'
import { replacementCandidates } from './reports'
import type { Asset } from './types'

/** 자산별 복합 위험(≥2 주의 신호) 판정 — 대장 필터(?risk=1)·자산 상세 '위험 신호' 요약·대시보드 큐가 공유하는 단일 소스.
 *  7 신호: 정합성 이슈(hasDataIssue) · EOL OS · 보증 임박(≤90일) · 정기 점검 도래 · 단일 장애점(SPOF) · 교체 대상 · 장기 미실측.
 *  각 신호는 대장 필터·패널과 같은 lib 빌더를 재사용해 임계값을 재계산하지 않는다(화면 간 정합 보장). 서버 전용. */
export function riskSignalCount(a: Asset): number {
  const s = getStore()
  const t = today()
  let n = 0
  if (isStaleVerify(a, s.opsPolicy.staleVerifyDays)) n += 1
  if (!['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (daysUntil(a.warrantyEnd) ?? 999) <= 90) n += 1
  if (hasDataIssue(a)) n += 1
  if (isEolTarget(a.status, a.os, t)) n += 1
  if (isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays)) n += 1
  if (SPOF_SET().has(a.assetNo)) n += 1
  if (REPLACE_SET().has(a.assetNo)) n += 1
  return n
}

// SPOF·교체 대상은 그래프/리스트 기반 전역 산출이라 자산별 반복 호출 시 캐시(한 요청 내 동일 스토어 스냅샷).
let _spof: Set<string> | null = null
let _replace: Set<string> | null = null
function SPOF_SET() { return (_spof ??= new Set(criticalDependencies().map((x) => x.asset.assetNo))) }
function REPLACE_SET() { return (_replace ??= new Set(replacementCandidates().cands.map((x) => x.a.assetNo))) }

/** 복합 위험(≥2 신호) 자산번호 목록 — assets 스냅샷 기준. 캐시는 호출 단위로 초기화. */
export function compositeRiskAssetNos(assets: Asset[]): string[] {
  _spof = null; _replace = null // 이 산출 배치의 캐시 초기화(스토어 변경 반영)
  return assets.filter((a) => riskSignalCount(a) >= 2).map((a) => a.assetNo)
}
