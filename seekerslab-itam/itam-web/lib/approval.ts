import { can } from './perm'
import { getStore } from './store'
import { APPROVAL_STEP_ROLE, approvalRoute, approvalStepLabel } from './types'
import type { Approval, Role } from './types'

/** 지금 이 결재 건을 이 권한그룹이 결재할 수 있는가 — 결재 처리(decide)의 역할 게이트와 동일 로직.
 *  대시보드 '내 결재 대기' 큐가 실제 결재 가능 여부와 어긋나지 않도록 판정을 한 곳에 둔다.
 *  ADMIN 오버라이드, 매핑된 단계는 그 단계 역할, 미매핑(예: 라이선스 품의)은 레거시(격리=보안담당·그 외=자산담당). */
export function canDecideApproval(role: Role, a: Approval): boolean {
  if (a.status !== '대기') return false
  if (!can('신청 · 결재', '결재', role)) return false
  const line = getStore().approvalLines.find((l) => l.kind === a.kind)
  const route = approvalRoute(line?.steps ?? [])
  const idx = route.indexOf(approvalStepLabel(a.currentStep))
  const stepRole = idx >= 0 ? APPROVAL_STEP_ROLE[route[idx]] : undefined
  const legacy = a.kind === '격리 요청' ? role === 'SEC_MGR' : role === 'ASSET_MGR'
  return role === 'ADMIN' || (stepRole ? role === stepRole : legacy)
}
