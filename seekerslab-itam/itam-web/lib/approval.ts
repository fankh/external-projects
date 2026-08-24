import { can } from './perm'
import { getStore } from './store'
import { APPROVAL_STEP_ROLE, approvalRoute, approvalStepIndex } from './types'
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
