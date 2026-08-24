import type { Asset, AssetCategory } from './types'

/** 보유자 이름 → 부서 맵 — 사용자 대장(store.users)에서 만든다. 정합성 검사가 보유자와 자산 부서의 불일치를 보는 데 쓴다. */
export type DeptOfOwner = Record<string, string>

/** 사용자 목록에서 이름 → 부서 맵을 만든다(서버 호출부·화면이 같은 방식으로 만들도록 한 곳에 둔다). */
export function deptOfOwner(users: { name: string; dept: string }[]): DeptOfOwner {
  const m: DeptOfOwner = {}
  for (const u of users) m[u.name] = u.dept
  return m
}

/** 물리 실물이 있는 유형 — 시리얼·위치는 이들에만 요구한다. SW·가상자원은 물리 시리얼·위치가 없다. */
const PHYSICAL: AssetCategory[] = ['단말', '서버', '네트워크', '주변기기']

/** 대장 정합성 점검 — 운영 중 자산의 핵심 필드 누락·불일치를 찾아낸다.
 *  CMDB 의 신뢰도는 대장과 실물의 일치에서 나온다(제품안내서 §03: 대장과 실물의 불일치를 줄인다).
 *  자유 서술이 아닌 규칙 기반 판정 — 대장 필터·대시보드·상세가 같은 함수를 공유해 화면 간 일관성을 보장한다. */
export function assetDataIssues(a: Asset, deptOf?: DeptOfOwner): string[] {
  const issues: string[] = []
  const blank = (v?: string) => !v || v.trim() === '' || v.trim() === '-'
  // 보유자는 '미지정'도 없는 것으로 본다 — 회수·분실 정리와 발견 편입이 그 값으로 '주인 없음'을 표시하는데,
  //  사용중·대여중 자산이 그 상태로 남으면 실물을 쥔 사람이 대장에 없는 것이다(문자열이 비어 있지 않다는 이유로
  //  정합성 큐에서 빠지면, 그 자산은 아무도 찾지 않는다).
  const noOwner = (v?: string) => blank(v) || v!.trim() === '미지정'
  // 위치도 자리표시자('실사 확인 필요')를 값으로 치지 않는다 — 발견 편입이 위치 미상을 그 문구로 적어 두는데,
  //  문자열이 비어 있지 않다는 이유로 정합성 큐에서 빠지면 실사로 위치를 확정할 계기가 사라진다(보유자와 같은 규약).
  const noLocation = (v?: string) => blank(v) || v!.trim() === '실사 확인 필요'
  const physical = PHYSICAL.includes(a.category)
  // 사용중·대여중인데 소유자가 없다 — 실물을 쥔 사람이 대장에 없다(회수·재배정 누락)
  if ((a.status === '사용중' || a.status === '대여중') && noOwner(a.owner)) issues.push('소유자 미지정')
  // 시리얼·위치는 실물 자산(H/W)만 — SW·가상자원은 물리 시리얼·위치가 없어 오탐이 된다
  if (physical && blank(a.serial)) issues.push('시리얼 누락')
  if (physical && noLocation(a.location)) issues.push('위치 누락')
  // 보유자 ↔ 부서 불일치 — 보유자가 대장에 있는 사용자면 그 사람의 부서가 곧 자산의 부서다(불출·재배정이 둘을 함께 쓴다).
  //  둘이 갈리면 부서별 비용 배분·통지·오프보딩 집계가 실제 보유 부서가 아닌 곳을 가리킨다(CSV 온보딩·수기 입력에서 생긴다).
  //  deptOf 는 호출부가 넘기는 '이름 → 부서' 맵이며, 넘기지 않으면 이 검사는 건너뛴다(순수 함수 유지).
  const ownerDept = deptOf && typeof deptOf === 'object' ? deptOf[(a.owner ?? '').trim()] : undefined
  if (ownerDept && (a.dept ?? '').trim() !== ownerDept) issues.push('부서 불일치')
  return issues
}

/** 정합성 미흡 여부 — 폐기 경로 자산은 대상에서 제외(정리 대상이라 필드 보정 실익이 없다). */
export function hasDataIssue(a: Asset, deptOf?: DeptOfOwner): boolean {
  if (a.status === '폐기완료' || a.status === '폐기예정') return false
  return assetDataIssues(a, deptOf).length > 0
}
