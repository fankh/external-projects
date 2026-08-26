import { getStore } from './store'
import { hasPartialScope, PERM_ACTIONS } from './types'
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
  const cell = row.cells[role]?.[idx]
  if (cell === 'n') return false
  // 'p'(부분)는 본인 범위 한정 허용 — 스코핑은 각 화면·반출이 따로 처리한다(PARTIAL_SCOPES).
  //  구현이 없는 칸에 'p' 가 남아 있으면(이 가드 이전에 저장된 스냅샷) 허용과 구분되지 않아 전사가 열린다 —
  //  권한은 보수적으로 읽어 불가로 판정한다. 지정 자체는 setPermission 이 이미 막는다.
  if (cell === 'p' && !hasPartialScope(menu, action, role)) return false
  return true
}

export { PARTIAL_SCOPES, PERM_ACTIONS, hasPartialScope } from './types'

/** 기능(Action) 사전 — STEP 1 메뉴기능관리. 화면이 제공하는 버튼의 의미와 강제 지점을 정의한다.
 *  메뉴·기능 관리 화면 표시와 엑셀 반출이 같은 정의를 쓰도록 한 곳에 둔다. (제품안내서 §02) */
export const ACTION_DEF: Record<PermAction, { desc: string; enforcedBy: string }> = {
  조회: { desc: '화면 진입과 목록·상세 조회', enforcedBy: '화면 가드 (lib/authz requireView — 매트릭스 조회 칸 + 라우트 역할)' },
  저장: { desc: '신규 등록·수정 저장', enforcedBy: '서버 — 화면별 액션 가드(자산 대장·수명주기·계약·Shadow SaaS)' },
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


/** 화면(라우트) ↔ 권한 매트릭스 메뉴 — 매트릭스의 '조회' 칸을 실제 화면 진입에 강제하기 위한 단일 매핑.
 *  그전에는 조회·저장·삭제 칸이 어디서도 읽히지 않아, 매트릭스에서 조회를 빼도 화면이 그대로 열렸다
 *  (can() 주석과 ACTION_DEF 의 '화면 가드' 표기가 실제와 달랐다 — 표시만 되고 강제되지 않는 정책).
 *  매핑되지 않은 화면(공지·QnA·연동 이력처럼 매트릭스에 대응 메뉴가 없는 것)은 라우트 역할 게이트만 적용한다.
 *  매트릭스는 필요조건이므로 이 매핑은 접근을 더 좁힐 뿐 넓히지 않는다. */
export const ROUTE_MENU: Record<string, PermMenu> = {
  // 대시보드는 매핑하지 않는다 — 진입 거부의 회귀 지점이라 여기까지 막으면 자기 자신으로 돌려보내는 고리가 된다.
  '/assets/register': '자산 대장',
  '/assets/lifecycle': '수명주기',
  '/assets/intake': '수명주기',
  '/assets/movement': '수명주기',
  '/assets/returns': '수명주기',
  '/assets/disposal': '수명주기',
  '/inventory/stock': '재고 · 재물조사',
  '/inventory/survey': '재고 · 재물조사',
  '/inventory/survey-plan': '재고 · 재물조사',
  '/inventory/contracts': '계약 · 라이선스',
  '/discovery/found': '발견 자산 · CMDB 대사',
  '/discovery/reconcile': '발견 자산 · CMDB 대사',
  '/discovery/scan': '발견 자산 · CMDB 대사',
  '/discovery/external': '발견 자산 · CMDB 대사',
  '/settings/scan-policy': '발견 자산 · CMDB 대사',
  '/discovery/saas': 'Shadow SaaS',
  '/settings/saas-catalog': 'Shadow SaaS',
  '/ai/assistant': 'AI 어시스턴트',
  '/ai/insights': 'AI 어시스턴트',
  '/ai/reports': 'AI 어시스턴트',
  '/settings/ai-policy': 'AI 어시스턴트',
  '/workflow/approvals': '신청 · 결재',
  '/settings/permissions': '권한 · 정책',
  '/settings/menus': '권한 · 정책',
  '/settings/users': '권한 · 정책',
  '/settings/codes': '권한 · 정책',
}

/** 매트릭스 밖에 두기로 한 화면 — canViewMenu 는 매핑이 없으면 '제한 없음'으로 통과시킨다(fail open).
 *  그 기본값 자체는 의도한 것이지만, 어느 화면이 그 위에 서 있는지가 코드 어디에도 적혀 있지 않았다.
 *  새 화면을 내비에 붙이면서 ROUTE_MENU 를 빠뜨리면 매트릭스를 조용히 우회한다 — 액션 가드에서 닫은 것과
 *  같은 종류의 구멍이다. 예외를 이름으로 적어 두고, 스모크가 '내비 화면 = 매핑 ∪ 예외'를 고정한다.
 *  (여기 없는 새 화면은 매핑을 빠뜨린 것으로 보고 실패시킨다 — 예외를 늘리려면 이 목록에 이유와 함께 적는다.) */
export const MATRIX_EXEMPT_ROUTES: Record<string, string> = {
  '/dashboard': '진입 거부의 회귀 지점 — 여기까지 막으면 자기 자신으로 돌려보내는 고리가 된다',
  '/board/notices': '전사 게시판 — 읽기는 모든 권한그룹의 기본 기능이라 매트릭스 축을 두지 않는다',
  '/board/qna': '전사 게시판 — 위와 같다',
  '/platform/integrations': '연동·인프라 — 라우트 역할 게이트(자산담당·보안담당·Admin)로만 통제한다',
}

/** 이 권한그룹이 이 화면을 열 수 있는가 — 매트릭스 '조회' 칸 기준(매핑 없는 화면은 제한 없음).
 *  화면 가드(lib/authz requireView)와 사이드바 표시가 이 한 판정을 공유한다 — 둘이 갈리면
 *  메뉴에는 보이는데 눌러 들어가면 튕기는 링크가 된다. 서버 전용(스토어 참조). */
export function canViewMenu(href: string, role: Role): boolean {
  const menu = ROUTE_MENU[href.split('?')[0]]
  return !menu || can(menu, '조회', role)
}

/** 이 권한그룹이 실제로 열 수 있는 화면 경로 — 라우트 역할 게이트 ∩ 매트릭스 조회 칸.
 *  클라이언트 컴포넌트(발송 이력·감사 로그·이상행위 표)가 참조 링크를 내줄지 판단할 때 쓴다.
 *  can() 은 스토어를 읽어 서버 전용이라 클라이언트에서 부를 수 없다 — 서버에서 목록을 만들어 넘긴다.
 *  '감출 목록'이 아니라 '열 수 있는 목록'을 넘기는 이유는 사이드바와 같다(권한 밖 경로를 페이로드에 싣지 않는다). */
export function openableRoutes(role: Role): string[] {
  return Object.keys(ROUTE_MENU).filter((href) => canViewMenu(href, role))
}