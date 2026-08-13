import { getStore } from './store'
import type { PermAction, PermMenu, Role } from './types'

/** 기능 단위 권한 조회 — 매트릭스는 **필요조건**이다.
 *
 *  설계상 중요한 점: 매트릭스에서 권한을 **빼면 실제로 막히지만, 넣는다고 코드의 규칙을 넘지는
 *  못한다**. 예컨대 '신청·결재 × 결재'를 사용자에게 켜도 결재 종류별 규칙(격리는 보안담당,
 *  그 외는 자산담당)이 그대로 적용된다. 화면 편집으로 권한이 상승하는 경로를 만들지 않기 위한
 *  제약이며, 이 때문에 매트릭스 편집은 잠금 위험 없이 안전하다. (제품안내서 §02) */
export function can(menu: PermMenu, action: PermAction, role: Role): boolean {
  const row = getStore().menuPermissions.find((m) => m.menu === menu)
  if (!row) return false
  const idx = PERM_ACTIONS.indexOf(action)
  if (idx < 0) return false
  // 'p'(부분)는 본인 범위 한정 허용 — 조회 스코핑은 각 화면이 따로 처리한다
  return row.cells[role]?.[idx] !== 'n'
}

export const PERM_ACTIONS = ['조회', '저장', '삭제', '엑셀', '편입', '격리요청', '결재'] as const

/** 기능(Action) 사전 — STEP 1 메뉴기능관리. 화면이 제공하는 버튼의 의미와 강제 지점을 정의한다.
 *  메뉴·기능 관리 화면 표시와 엑셀 반출이 같은 정의를 쓰도록 한 곳에 둔다. (제품안내서 §02) */
export const ACTION_DEF: Record<PermAction, { desc: string; enforcedBy: string }> = {
  조회: { desc: '화면 진입과 목록·상세 조회', enforcedBy: '화면 가드 (lib/authz requireRole)' },
  저장: { desc: '신규 등록·수정 저장', enforcedBy: '화면 가드' },
  삭제: { desc: '레코드 삭제·비활성화', enforcedBy: '화면 가드' },
  엑셀: { desc: '그리드 데이터 .xlsx 내보내기', enforcedBy: '서버 — /api/export/[kind]' },
  편입: { desc: '발견 자산을 대장으로 편입 요청', enforcedBy: '서버 — requestOnboard' },
  격리요청: { desc: 'NAC 격리 요청 상신', enforcedBy: '서버 — requestQuarantine' },
  결재: { desc: '상신 건 승인·반려', enforcedBy: '서버 — decide' },
}

export const PERM_MENUS = [
  '대시보드', '자산 대장', '수명주기', '재고 · 재물조사', '계약 · 라이선스',
  '발견 자산 · CMDB 대사', 'Shadow SaaS', 'AI 어시스턴트', '신청 · 결재', '권한 · 정책',
] as const

/** 절대 회수할 수 없는 칸 — Admin 이 권한 화면 자체를 잠가 스스로를 가두는 것을 막는다 */
export function isLocked(menu: PermMenu, action: PermAction, role: Role): boolean {
  return role === 'ADMIN' && menu === '권한 · 정책' && (action === '조회' || action === '저장')
}
