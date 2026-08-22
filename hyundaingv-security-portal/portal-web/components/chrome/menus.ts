import type { Role } from '@/lib/types'

export interface NavItem {
  href: string
  label: string
  /** 아이콘 키 — components/chrome/Icon.tsx 의 라인 아이콘 세트 참조 */
  ico: string
  roles: Role[]
  /** 좌측 내비 뱃지 키 (레이아웃에서 카운트 주입) */
  badge?: 'todos' | 'approvals'
}

export interface NavGroup {
  label: string
  /** 도메인 액센트 색 — 뉴트럴 그레이 UI에서 도메인 구분은 액센트 색으로만 차등한다 */
  hue: string
  items: NavItem[]
}

const ALL: Role[] = ['USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN']
const DEPT: Role[] = ['DEPT_MGR', 'BIZ_MGR', 'ADMIN']
const BIZ: Role[] = ['BIZ_MGR', 'ADMIN']
const ADM: Role[] = ['ADMIN']

/** 메뉴 체계 — 10대 업무 도메인 (제품안내서 §01) × 권한그룹 매핑 */
export const NAV: NavGroup[] = [
  {
    label: '메인',
    hue: '#475569',
    items: [
      { href: '/dashboard', label: '개인별현황', ico: 'dashboard', roles: ALL },
      { href: '/board/notices', label: '공지사항', ico: 'megaphone', roles: ALL },
      { href: '/board/qna', label: 'QnA', ico: 'help', roles: ALL },
    ],
  },
  {
    label: 'IT 투자/비용',
    hue: '#2f6b64',
    items: [
      { href: '/finance/invest', label: '투자 관리', ico: 'invest', roles: ALL },
      { href: '/finance/expense', label: '비용 관리', ico: 'expense', roles: ALL },
      { href: '/finance/asset-reg', label: '자산등록 (API 연계)', ico: 'package', roles: BIZ },
    ],
  },
  {
    label: '서비스요청',
    hue: '#3c5a85',
    items: [
      { href: '/sr/new', label: 'SR 신청', ico: 'fileplus', roles: ALL },
      { href: '/sr/requests', label: '신청내역', ico: 'list', roles: ALL },
      { href: '/sr/ci', label: 'CI SR 관리', ico: 'layers', roles: BIZ },
      { href: '/sr/manage', label: 'SR 관리', ico: 'sliders', roles: BIZ },
      { href: '/sr/delayed', label: '지연내역', ico: 'clock', roles: BIZ },
    ],
  },
  {
    label: '인프라 운영',
    hue: '#4a5568',
    items: [
      { href: '/infra/systems', label: '시스템 · 서버 현황', ico: 'server', roles: BIZ },
      { href: '/infra/racks', label: '랙 · H/W 관리', ico: 'harddrive', roles: BIZ },
      { href: '/infra/operations', label: '배치 · 인터페이스 · 디스크', ico: 'exchange', roles: BIZ },
      { href: '/infra/incidents', label: '장애관리 · 통계 · 대책', ico: 'alert', roles: BIZ },
      { href: '/infra/changes', label: '변경관리', ico: 'refresh', roles: BIZ },
    ],
  },
  {
    label: '프로젝트',
    hue: '#8a6224',
    items: [
      { href: '/projects/status', label: '진행현황 · 인력투입', ico: 'chart', roles: BIZ },
      { href: '/projects/schedule', label: '일정 · 산출물 · 이슈', ico: 'calendar', roles: BIZ },
      { href: '/projects/reports', label: '회의록 · 주간보고', ico: 'filetext', roles: BIZ },
    ],
  },
  {
    label: '임직원 의식제고',
    hue: '#8a4a52',
    items: [
      { href: '/pledge/my', label: '보안서약서 제출', ico: 'pen', roles: ALL },
      { href: '/pledge/dept', label: '부서 서약 현황', ico: 'clipboardcheck', roles: DEPT },
      { href: '/pledge/manage', label: '전사 현황 · 양식관리', ico: 'clipboardlist', roles: BIZ },
      { href: '/awareness/remote', label: '재택근무 체크리스트', ico: 'home', roles: ALL },
      { href: '/awareness/prints', label: '출력물 개인정보관리', ico: 'printer', roles: ALL },
      /** 위반자 본인이 사실확인서를 작성해야 하므로 전 권한 접근 — 화면 안에서 본인 건만 노출 */
      { href: '/awareness/violations', label: '보안위반 관리', ico: 'shieldalert', roles: ALL },
    ],
  },
  {
    label: '보안 컴플라이언스',
    hue: '#3a6b47',
    items: [
      { href: '/compliance/education', label: '보안교육', ico: 'cap', roles: ALL },
      { href: '/compliance/inspection', label: '보안점검 (ISMS)', ico: 'shieldcheck', roles: BIZ },
      { href: '/compliance/security-review', label: '보안성 검토', ico: 'filesearch', roles: BIZ },
      { href: '/compliance/risks', label: '정보보호 위험평가', ico: 'flag', roles: BIZ },
      { href: '/compliance/policies', label: '정책·지침 관리', ico: 'book', roles: BIZ },
      { href: '/compliance/dr', label: '재해복구·업무연속성', ico: 'lifebuoy', roles: BIZ },
    ],
  },
  {
    label: '내 업무',
    hue: '#3a6b7d',
    items: [
      { href: '/work/todo', label: '나의 할일', ico: 'checksquare', roles: ALL, badge: 'todos' },
      { href: '/work/approvals', label: '결재함', ico: 'filecheck', roles: ALL, badge: 'approvals' },
    ],
  },
  {
    label: '환경설정',
    hue: '#52525b',
    items: [
      { href: '/settings/users', label: '사용자 · 그룹 · 결재선', ico: 'users', roles: ADM },
      { href: '/settings/menus', label: '메뉴 · 기능 관리', ico: 'tree', roles: ADM },
      { href: '/settings/permissions', label: '메뉴권한', ico: 'lock', roles: ADM },
      { href: '/settings/groups', label: '사용자 그룹', ico: 'usergroup', roles: ADM },
      { href: '/settings/codes', label: '공통코드', ico: 'hash', roles: ADM },
      { href: '/settings/forms', label: '엑셀양식 관리', ico: 'table', roles: ADM },
      { href: '/settings/audit', label: '감사 이력', ico: 'history', roles: ADM },
    ],
  },
  {
    label: '기반관리',
    hue: '#52525b',
    items: [{ href: '/platform/integrations', label: '연동 · 인프라', ico: 'plug', roles: ADM }],
  },
]

export const TITLE_BY_HREF: Record<string, { group: string; title: string; hue: string }> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, { group: g.label, title: i.label, hue: g.hue }])),
)

/** 사용자 그룹으로 열람 위임 가능한(운영) 메뉴인가 — ADMIN 전용 화면(환경설정·기반)은 위임 대상에서 제외한다.
 *  일부 ADMIN 화면은 쓰기 액션을 requireMenu 로 가드하므로(예: 메뉴권한 토글 = requireMenu('/settings/permissions')),
 *  그 화면을 그룹으로 위임하면 위임받은 비관리자가 관리 기능까지 실행하게 된다. 위임은 '운영 화면 열람'으로
 *  한정해(기본 역할에 비관리자 역할이 하나라도 있는 화면만) 권한 상승을 원천 차단한다. */
export function isGrantableMenu(href: string): boolean {
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href)
  return !!item && item.roles.some((r) => r !== 'ADMIN')
}

/** 기능(Action) 단위 권한 (제품안내서 §II '권한은 메뉴 × 기능 단위로 부여'·요구사항 69·71행) — 조회는 열람 자체라
 *  항상 허용, 쓰기 기능(저장·삭제·엑셀·업로드·결재)만 역할로 제한한다. 여기 정의가 requireAction(강제)과
 *  권한 매트릭스(표시·편집)의 단일 원천이라 표시와 강제가 어긋나지 않는다(드리프트 방지). */
export const ACTION_KEYS = ['save', 'delete', 'excel', 'upload', 'confirm', 'approve'] as const
export type ActionKey = (typeof ACTION_KEYS)[number]
export const ACTION_LABEL: Record<ActionKey, string> = {
  save: '저장', delete: '삭제', excel: '엑셀', upload: '업로드', confirm: '확정', approve: '결재',
}

/** 화면×기능 기본 권한 — 미등록 (href,action) 은 기능 게이트 없음(화면 권한만). 현 단계는 거버넌스 레코드
 *  삭제(가장 파괴적 기능)를 컴플라이언스 도메인에 우선 적용해 소진; 인프라는 requireAction 확장 시 추가한다. */
export const SCREEN_ACTIONS: Record<string, Partial<Record<ActionKey, Role[]>>> = {
  '/compliance/risks': { delete: ['BIZ_MGR', 'ADMIN'] },
  '/compliance/policies': { delete: ['BIZ_MGR', 'ADMIN'] },
  '/compliance/dr': { delete: ['BIZ_MGR', 'ADMIN'] },
  // 보안점검(ISMS) 기준관리 삭제 — 위험·정책·DR 과 함께 컴플라이언스 도메인 삭제 통제 완성.
  // 계획 참조 중인 항목은 화면에서 '사용중'으로 삭제 차단(별개 무결성 가드).
  '/compliance/inspection': { delete: ['BIZ_MGR', 'ADMIN'] },
  // 공지사항 삭제 — 전사 공식 게시물(거버넌스 기록)이라 삭제 기능을 관리자급으로 통제.
  '/board/notices': { delete: ['BIZ_MGR', 'ADMIN'] },
  // 인프라 자산 삭제 — 랙·H/W(racks)·서버·시스템(systems)·배치·인터페이스(operations). 한 화면의 삭제 기능은
  // 그 화면의 모든 delete 액션을 함께 통제한다(예: /infra/racks delete = 랙·H/W 삭제 공통).
  '/infra/racks': { delete: ['BIZ_MGR', 'ADMIN'] },
  '/infra/systems': { delete: ['BIZ_MGR', 'ADMIN'] },
  '/infra/operations': { delete: ['BIZ_MGR', 'ADMIN'] },
  // 재무 확정 — 경영계획 최종 확정(투자·비용). 취합·효율화 우회 없이 예산을 굳히는 통제점. 소유자 스코프인
  // 임시저장·상신(submitPlanDraft)과 달리 confirmPlan 은 관리자급 역할 게이트라 기능 권한에 적합.
  '/finance/invest': { confirm: ['BIZ_MGR', 'ADMIN'] },
  '/finance/expense': { confirm: ['BIZ_MGR', 'ADMIN'] },
  // SR 관리 저장 — CI 배정·접수·처리(ci)와 SR 진행·상신·중지/재개(manage)의 관리자 처리. 신청·재상신(본인 스코프)은
  // 별개로 기존 가드 유지. 한 화면의 저장 기능이 그 화면 관리 액션을 함께 통제한다.
  '/sr/ci': { save: ['BIZ_MGR', 'ADMIN'] },
  '/sr/manage': { save: ['BIZ_MGR', 'ADMIN'] },
}
