import { getStore } from './store'

/** 공통코드 참조 수 — 특정 코드값(label)을 참조하는 살아있는 레코드 수를 그룹별 참조 필드에서 센다.
 *  미사용 전환·명칭 변경 가드의 근거: 참조가 남은 코드를 미사용화하면 드롭다운(위치·유형 등)에서 사라져,
 *  그 값을 가진 자산을 다시 선택할 수 없어 허위 불일치·사각지대가 생긴다(구축_요약 위치 코드 누락 버그류).
 *
 *  그룹별로 참조 필드가 다르다 — label 이 저장 필드값과 일치하는 그룹만 집계(그 외는 0).
 *  **참조 필드를 하나라도 빠뜨리면 가드가 조용히 열린다**: 화면은 '사용 중 N건'을 이관 기준으로 제시하는데,
 *  집계된 N건만 이관하면 세지 않은 컬렉션이 아직 그 코드를 붙들고 있는 채로 전환·개명이 통과한다.
 *  그래서 이 함수는 해당 코드 체계를 저장하는 **모든** 컬렉션을 센다. 서버 전용. */
export function codeUsage(groupId: string, label: string): number {
  const s = getStore()
  const count = <T,>(arrays: T[][], pick: (x: T) => string | undefined): number =>
    arrays.reduce((n, arr) => n + arr.filter((x) => pick(x) === label).length, 0)

  switch (groupId) {
    case 'LOCATION':
      // 위치는 대장 밖에서도 살아 있다 — 아직 집행되지 않은 이동 신청의 목적지, 진행 중인 재물조사 회차의 범위가
      //  모두 이 코드값을 들고 있다. 대장만 세면 "사용 중 아님"으로 읽혀 미사용 전환·개명이 통과하고,
      //  그 뒤 이동 집행은 사라진 위치를 대장에 쓰거나 막히고 회차는 없는 범위를 가리킨다
      //  (이 함수의 규약이 "해당 코드 체계를 저장하는 모든 컬렉션을 센다"인데 위치만 한 곳이었다).
      //  종결된 기록(집행·종결된 신청, 완료 회차)은 증거라 세지 않는다 — 살아있는 참조만 막는다.
      return s.assets.filter((a) => a.location === label).length
        + s.approvals.filter((a) => a.targetLocation === label && (a.status === '대기' || (a.status === '승인' && !a.fulfilled && !a.unfulfilledReason))).length
        + s.inventoryRounds.filter((r) => r.scope === label && r.status !== '완료').length
    case 'ASSET_CATEGORY':
      // 대장뿐 아니라 아직 자산이 되지 않은 유형 참조까지 — 도입 로트(채번 전), AI 자동분류 확정·제안 유형,
      //  자산 신청의 희망 유형. 이들이 참조하는 유형을 미사용화하면 채번·판정·불출 추천이 사라진 코드를 가리킨다.
      return count<{ category?: string }>([s.assets, s.intakeLots], (x) => x.category)
        + s.discovered.filter((d) => d.classifiedCategory === label).length
        + s.insights.filter((i) => i.proposedCategory === label).length
        + s.approvals.filter((a) => a.desiredCategory === label).length
    case 'ASSET_STATUS':
      return s.assets.filter((a) => a.status === label).length
    case 'DATA_GRADE':
      return s.saasCatalog.filter((c) => c.dataGrade === label).length
    case 'RECONCILE':
      // 대사 상태는 발견 자산과 외부 공격표면 자산이 함께 쓴다(둘 다 ReconcileState).
      return count<{ state?: string }>([s.discovered, s.external], (x) => x.state)
    case 'RISK':
      // 위험도는 발견·SaaS·미인가 SW 를 넘어 외부 위협·계정·USB·로컬 VM·클라우드·미발견 단말까지 공통 등급이고,
      //  AI 제안·IOC 상관·크리덴셜 노출은 같은 등급을 severity 로 저장한다(그룹 설명의 'AI 제안 공통 등급').
      return count<{ risk?: string }>(
        [s.discovered, s.saas, s.unauthorizedSw, s.external, s.unseenExternal, s.accounts, s.usbFindings, s.localVms, s.cloudFindings, s.undiscovered],
        (x) => x.risk,
      ) + count<{ severity?: string }>([s.insights, s.iocMatches, s.credentials], (x) => x.severity)
    default:
      return 0
  }
}

/** 사용 중인 위치 코드 목록 — 공통코드 LOCATION 그룹에서 미사용 처리분을 뺀 표시 순서대로.
 *  위치를 고르는 화면(이동 신청·실사 스캔)이 모두 이 목록에서 선택지를 만든다. 서버 전용. */
export function activeLocations(): string[] {
  return (getStore().codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)
}

/** 이 위치가 레지스트리에 있는가 — 대장에 위치를 쓰는 서버 액션의 입력 검사.
 *  화면은 드롭다운으로 레지스트리 값만 내주지만, 서버 액션은 화면을 거치지 않고도 호출된다
 *  (권한 가드가 '버튼을 숨겨도 액션 id 로 직접 호출할 수 있다'고 적어 둔 것과 같은 이유).
 *  레지스트리 밖 위치가 대장에 실리면 그 자산은 재물조사 회차에 편성될 수도, 그 위치로 스캔될 수도 없어
 *  실물이 있는데 실사에서 구조적으로 빠진다 — 재물조사가 잡으려는 '유령 자산'을 재물조사 자신이 만드는 셈이다.
 *  (스모크의 위치 레지스트리 커버리지 검사는 시드를 보는 것이라, 운영 중 들어오는 값은 여기서 막아야 한다.) */
export function isKnownLocation(label: string): boolean {
  return activeLocations().includes(label.trim())
}
