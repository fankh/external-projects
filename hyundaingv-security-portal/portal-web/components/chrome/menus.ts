import type { Role } from '@/lib/types'

export interface NavItem {
  href: string
  label: string
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
    label: 'Main',
    hue: '#475569',
    items: [
      { href: '/dashboard', label: '개인별현황', ico: '◧', roles: ALL },
      { href: '/board/notices', label: '공지사항', ico: '≡', roles: ALL },
      { href: '/board/qna', label: 'QnA', ico: '?', roles: ALL },
    ],
  },
  {
    label: 'IT 투자/비용',
    hue: '#0f766e',
    items: [
      { href: '/finance/invest', label: '투자 관리', ico: '₩', roles: ALL },
      { href: '/finance/expense', label: '비용 관리', ico: '∑', roles: ALL },
      { href: '/finance/asset-reg', label: '자산등록 (API 연계)', ico: '▤', roles: BIZ },
    ],
  },
  {
    label: 'IT Request',
    hue: '#1d4ed8',
    items: [
      { href: '/sr/new', label: 'SR 신청', ico: '⊕', roles: ALL },
      { href: '/sr/requests', label: '신청내역', ico: '▤', roles: ALL },
      { href: '/sr/ci', label: 'CI SR 관리', ico: '⊞', roles: BIZ },
      { href: '/sr/manage', label: 'SR 관리', ico: '⚙', roles: BIZ },
      { href: '/sr/delayed', label: '지연내역', ico: '⏱', roles: BIZ },
    ],
  },
  {
    label: '인프라 운영',
    hue: '#6d28d9',
    items: [
      { href: '/infra/systems', label: '시스템 · 서버 현황', ico: '▣', roles: BIZ },
      { href: '/infra/racks', label: '랙 · H/W 관리', ico: '☰', roles: BIZ },
      { href: '/infra/operations', label: '배치 · 인터페이스 · 디스크', ico: '⇄', roles: BIZ },
      { href: '/infra/incidents', label: '장애관리 · 통계 · 대책', ico: '⚠', roles: BIZ },
      { href: '/infra/changes', label: '변경관리', ico: '⟳', roles: BIZ },
    ],
  },
  {
    label: '프로젝트',
    hue: '#b45309',
    items: [
      { href: '/projects/status', label: '진행현황 · 인력투입', ico: '◔', roles: BIZ },
      { href: '/projects/schedule', label: '일정 · 산출물 · 이슈', ico: '⊟', roles: BIZ },
      { href: '/projects/reports', label: '회의록 · 주간보고', ico: '▦', roles: BIZ },
    ],
  },
  {
    label: '임직원 의식제고',
    hue: '#be123c',
    items: [
      { href: '/pledge/my', label: '보안서약서 제출', ico: '✎', roles: ALL },
      { href: '/pledge/dept', label: '부서 서약 현황', ico: '◫', roles: DEPT },
      { href: '/pledge/manage', label: '전사 현황 · 양식관리', ico: '▥', roles: BIZ },
      { href: '/awareness/remote', label: '재택근무 체크리스트', ico: '⌂', roles: ALL },
      { href: '/awareness/prints', label: '출력물 개인정보관리', ico: '⎙', roles: ALL },
      /** 위반자 본인이 사실확인서를 작성해야 하므로 전 권한 접근 — 화면 안에서 본인 건만 노출 */
      { href: '/awareness/violations', label: '보안위반 관리', ico: '⊘', roles: ALL },
    ],
  },
  {
    label: '보안 컴플라이언스',
    hue: '#15803d',
    items: [
      { href: '/compliance/education', label: '보안교육', ico: '✦', roles: ALL },
      { href: '/compliance/inspection', label: '보안점검 (ISMS)', ico: '✓', roles: BIZ },
      { href: '/compliance/security-review', label: '보안성 검토', ico: '◈', roles: BIZ },
      { href: '/compliance/risks', label: '정보보호 위험평가', ico: '⚑', roles: BIZ },
      { href: '/compliance/policies', label: '정책·지침 관리', ico: '§', roles: BIZ },
    ],
  },
  {
    label: 'My Work',
    hue: '#0e7490',
    items: [
      { href: '/work/todo', label: '나의 할일', ico: '☑', roles: ALL, badge: 'todos' },
      { href: '/work/approvals', label: '결재함', ico: '✓', roles: ALL, badge: 'approvals' },
    ],
  },
  {
    label: '환경설정',
    hue: '#52525b',
    items: [
      { href: '/settings/users', label: '사용자 · 그룹 · 결재선', ico: '☰', roles: ADM },
      { href: '/settings/menus', label: '메뉴 · 기능 관리', ico: '▤', roles: ADM },
      { href: '/settings/permissions', label: '메뉴권한', ico: '⚙', roles: ADM },
      { href: '/settings/codes', label: '공통코드', ico: '#', roles: ADM },
      { href: '/settings/forms', label: '엑셀양식 관리', ico: '▦', roles: ADM },
      { href: '/settings/audit', label: '감사 이력', ico: '☲', roles: ADM },
    ],
  },
  {
    label: '기타 (기반)',
    hue: '#52525b',
    items: [{ href: '/platform/integrations', label: '연동 · 인프라', ico: '⇌', roles: ADM }],
  },
]

export const TITLE_BY_HREF: Record<string, { group: string; title: string; hue: string }> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, { group: g.label, title: i.label, hue: g.hue }])),
)
