import { getStore } from './store'

/** 공통코드 참조 수 — 특정 코드값(label)을 참조하는 살아있는 레코드 수를 그룹별 참조 필드에서 센다.
 *  미사용 전환 가드의 근거: 참조가 남은 코드를 미사용화하면 드롭다운(위치·유형 등)에서 사라져,
 *  그 값을 가진 자산을 다시 선택할 수 없어 허위 불일치·사각지대가 생긴다(구축_요약 위치 코드 누락 버그류).
 *  그룹별로 참조 필드가 다르다 — label 이 저장 필드값과 일치하는 그룹만 집계(그 외는 0). */
export function codeUsage(groupId: string, label: string): number {
  const s = getStore()
  switch (groupId) {
    case 'LOCATION':
      return s.assets.filter((a) => a.location === label).length
    case 'ASSET_CATEGORY':
      return s.assets.filter((a) => a.category === label).length
    case 'ASSET_STATUS':
      return s.assets.filter((a) => a.status === label).length
    case 'DATA_GRADE':
      return s.saasCatalog.filter((c) => c.dataGrade === label).length
    case 'RECONCILE':
      return s.discovered.filter((d) => d.state === label).length
    case 'RISK':
      return s.discovered.filter((d) => d.risk === label).length
        + s.saas.filter((u) => u.risk === label).length
        + s.unauthorizedSw.filter((w) => w.risk === label).length
    default:
      return 0
  }
}
