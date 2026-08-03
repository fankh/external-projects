import type { Asset } from './types'

/** 대장 정합성 점검 — 운영 중 자산의 핵심 필드 누락·불일치를 찾아낸다.
 *  CMDB 의 신뢰도는 대장과 실물의 일치에서 나온다(제품안내서 §03: 대장과 실물의 불일치를 줄인다).
 *  자유 서술이 아닌 규칙 기반 판정 — 대장 필터·대시보드·상세가 같은 함수를 공유해 화면 간 일관성을 보장한다. */
export function assetDataIssues(a: Asset): string[] {
  const issues: string[] = []
  const blank = (v?: string) => !v || v.trim() === '' || v.trim() === '-'
  // 사용중·대여중인데 소유자가 없다 — 실물을 쥔 사람이 대장에 없다(회수·재배정 누락)
  if ((a.status === '사용중' || a.status === '대여중') && blank(a.owner)) issues.push('소유자 미지정')
  // 시리얼 누락 — 실물 대조·보증 청구의 기준값이 없다
  if (blank(a.serial)) issues.push('시리얼 누락')
  // 위치 누락 — 재물조사·회수 시 찾을 수 없다
  if (blank(a.location)) issues.push('위치 누락')
  return issues
}

/** 정합성 미흡 여부 — 폐기 경로 자산은 대상에서 제외(정리 대상이라 필드 보정 실익이 없다). */
export function hasDataIssue(a: Asset): boolean {
  if (a.status === '폐기완료' || a.status === '폐기예정') return false
  return assetDataIssues(a).length > 0
}
