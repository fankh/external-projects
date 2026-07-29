import type { Role } from '@/lib/types'

export interface NavItem {
  href: string
  label: string
  ico: string
  roles: Role[]
  /** 사이드바 뱃지 키 (레이아웃에서 카운트 주입) */
  badge?: 'approvals' | 'unregistered'
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const ALL: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
const MGRS: Role[] = ['ASSET_MGR', 'ADMIN']
const SEC: Role[] = ['ASSET_MGR', 'SEC_MGR', 'ADMIN']

/** 메뉴 체계 — 8대 업무 도메인 (제품안내서 §01) × 권한그룹 매핑 */
export const NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [{ href: '/dashboard', label: '대시보드', ico: '◧', roles: ALL }],
  },
  {
    label: '자산관리',
    items: [
      { href: '/assets/register', label: '자산 대장', ico: '▤', roles: ALL },
      { href: '/assets/lifecycle', label: '수명주기', ico: '⟳', roles: MGRS },
    ],
  },
  {
    label: '재고 · 계약',
    items: [
      { href: '/inventory/stock', label: '재고 · 재물조사', ico: '▦', roles: MGRS },
      { href: '/inventory/contracts', label: '계약 · 라이선스', ico: '§', roles: MGRS },
    ],
  },
  {
    label: 'Discovery',
    items: [
      { href: '/discovery/found', label: '발견 자산', ico: '◎', roles: SEC, badge: 'unregistered' },
      { href: '/discovery/reconcile', label: 'CMDB 대사', ico: '⇄', roles: SEC },
      { href: '/discovery/saas', label: 'Shadow SaaS', ico: '☁', roles: SEC },
      { href: '/discovery/external', label: '외부 공격표면', ico: '◈', roles: SEC },
    ],
  },
  {
    label: 'AI 인텔리전스',
    items: [
      { href: '/ai/assistant', label: 'AI 어시스턴트', ico: '✦', roles: ALL },
      { href: '/ai/insights', label: '분석 · 예측', ico: '∿', roles: SEC },
      { href: '/ai/reports', label: '리포트 자동 생성', ico: '▦', roles: SEC },
    ],
  },
  {
    label: '워크플로',
    items: [{ href: '/workflow/approvals', label: '신청 · 결재', ico: '✓', roles: ALL, badge: 'approvals' }],
  },
  {
    label: '환경설정',
    items: [
      { href: '/settings/permissions', label: '메뉴 권한', ico: '⚙', roles: ['ADMIN'] },
      { href: '/settings/users', label: '사용자 · 결재선', ico: '☰', roles: ['ADMIN'] },
      { href: '/settings/codes', label: '공통코드', ico: '#', roles: ['ADMIN'] },
      { href: '/settings/scan-policy', label: '탐지 채널 · 정책', ico: '◉', roles: ['ADMIN'] },
      { href: '/settings/saas-catalog', label: 'SaaS 카탈로그', ico: '▤', roles: ['ADMIN'] },
      { href: '/settings/ai-policy', label: 'AI 정책', ico: '✦', roles: ['ADMIN'] },
    ],
  },
  {
    label: '기타 (기반)',
    items: [{ href: '/platform/integrations', label: '연동 · 인프라', ico: '⇌', roles: SEC }],
  },
]

export const TITLE_BY_HREF: Record<string, { group: string; title: string }> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, { group: g.label, title: i.label }])),
)
