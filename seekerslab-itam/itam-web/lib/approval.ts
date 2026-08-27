import { can } from './perm'
import { getStore } from './store'
import { APPROVAL_STEP_ROLE, MANDATORY_APPROVAL_KINDS, approvalRoute, approvalStepIndex } from './types'
import type { Approval, Role } from './types'

/** 지금 이 결재 건을 이 권한그룹이 결재할 수 있는가 — 결재 처리(decide)의 역할 게이트와 동일 로직.
 *  대시보드 '내 결재 대기' 큐·상단 배지가 실제 결재 가능 여부와 어긋나지 않도록 판정을 한 곳에 둔다.
 *  ADMIN 오버라이드, 결재선이 있으면 그 단계 역할(상신 뒤 결재선이 바뀌어 단계가 사라졌으면 남은 경로의 처음),
 *  결재선 자체가 없으면(예: 라이선스 품의) 레거시(격리=보안담당·그 외=자산담당). */
export function canDecideApproval(role: Role, a: Approval): boolean {
  if (a.status !== '대기') return false
  // 소유자 확인은 결재가 아니라 요청받은 부서의 응답(answerOwnerConfirm)으로 처리한다 — decide 가 거부하고
  //  일괄 승인도 건너뛰며 결재함도 결재 버튼을 내주지 않는다. 여기서만 세면 '내 결재 차례 N건'과 배지가
  //  결재함에서 처리할 수 없는 건까지 세어(Admin 은 오버라이드로 전부 통과) 들어가도 할 일이 없는 큐가 된다.
  if (a.kind === '소유자 확인') return false
  if (!can('신청 · 결재', '결재', role)) return false
  const line = getStore().approvalLines.find((l) => l.kind === a.kind)
  const route = approvalRoute(line?.steps ?? [])
  const idx = approvalStepIndex(route, a.currentStep)
  const stepRole = idx >= 0 ? APPROVAL_STEP_ROLE[route[idx]] : undefined
  const legacy = a.kind === '격리 요청' ? role === 'SEC_MGR' : role === 'ASSET_MGR'
  return role === 'ADMIN' || (stepRole ? role === stepRole : legacy)
}

/** 이 결재 종류가 '필수 결재'로 지정돼 있는가 — 사용자·결재선 화면(STEP 4)의 토글 값.
 *
 *  그동안 required 는 화면 배지·지표·컴플라이언스 리포트에 표시만 되고 아무것도 막지 않았다.
 *  관리자가 '대여'를 필수 결재로 지정해도 자산 대장에서 직접 대여가 그대로 됐다 — 선언된 정책이
 *  강제되지 않는 계열(권한 매트릭스의 조회·저장 칸과 같은 문제)이다.
 *
 *  강제 지점은 각 종류의 **직접 실행** 진입점이다:
 *   · 대여 → loanAsset / loanAssetMany (직접 대여)
 *   · 이동 → reassignAsset / reassignAssetMany (재배정 = 직접 인계)
 *   · SaaS 인가 → decideSaas(…, '인가') (직접 인가 판정)
 *  반납·자산 신청은 직접 실행 경로가 없다 — 신청 자체가 결재이고 그 뒤는 승인분 집행뿐이라 막을 대상이 없다.
 *  폐기·격리 요청·소유자 확인·차이 조정은 애초에 결재로만 진행되며 필수 해제도 불가(MANDATORY_APPROVAL_KINDS). */
export function requiresApproval(kind: Approval['kind']): boolean {
  // 필수 고정 종류는 저장된 플래그와 무관하게 필수다 — 토글이 해제를 거부하므로 required 는 늘 true 여야 하지만,
  //  그 불변식을 '저장된 값'에서만 읽으면 낡은 스냅샷·결재선 누락 한 번에 조용히 깨진다(권한 매트릭스의
  //  잔존 'p' 와 같은 자리다). 폐기·격리 요청·소유자 확인·차이 조정에 직접 실행 경로가 열리는 것은
  //  선언된 정책이 강제되지 않는 계열의 가장 무거운 쪽이라, 판정에서 상수를 먼저 본다.
  if (MANDATORY_APPROVAL_KINDS.includes(kind)) return true
  return getStore().approvalLines.some((l) => l.kind === kind && l.required)
}
