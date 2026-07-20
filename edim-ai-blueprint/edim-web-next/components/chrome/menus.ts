/** 모듈·메뉴 트리 — 레거시 SPA(shell/menus.ts) 구조를 Next 라우트로 매핑.
 *  그룹 노드는 href 없음(펼침/접힘), 리프는 href 로 이동. i18n = menu.<id> 키(KO 폴백). */

export type ModuleKey = 'cpq' | 'plm' | 'code' | 'erp' | 'toolbox' | 'common'

export const MODULES: { id: ModuleKey; label: string }[] = [
  { id: 'toolbox', label: 'Toolbox' },
  { id: 'cpq', label: 'CPQ' },
  { id: 'plm', label: 'PLM' },
  { id: 'code', label: 'Code Set-up' },
  { id: 'erp', label: 'ERP' },
  { id: 'common', label: '공통' },
]

export interface NavNode {
  id: string
  label: string          // KO 폴백 (번역 키 menu.<id>)
  href?: string          // 리프만
  code?: string          // 화면 코드 (MDI 탭 표기)
  minLevel?: 'SETUP' | 'ADMIN'   // 미만 등급 숨김 (서버 RBAC 이 실 가드)
  children?: NavNode[]
}

export const MENU_TREE: Record<ModuleKey, { title: string; nodes: NavNode[] }> = {
  cpq: {
    title: 'CPQ',
    nodes: [
      {
        id: 'cpq-root', label: 'Product', children: [
          {
            id: 'cpq-ahu', label: 'AHU', children: [
              { id: 'cpq-selection', label: '제품 선정 (C-1)', href: '/cpq/selection', code: 'C-1' },
              { id: 'cpq-techdata', label: '기술 데이터 (C-2)', href: '/cpq/tech-data', code: 'C-2' },
              { id: 'cpq-xreview', label: 'X-code 검토 (C-1X)', href: '/cpq/x-review', code: 'C-1X' },
              { id: 'cpq-run', label: 'Run 파이프라인 (C-1)', href: '/cpq/run', code: 'C-1R' },
            ],
          },
          { id: 'cpq-fan', label: 'Fan', children: [] },
        ],
      },
      {
        id: 'cpq-doc', label: 'Document', children: [
          { id: 'cpq-doctpl', label: 'Document Templet (C-3)', href: '/cpq/doc-template', code: 'C-3' },
          { id: 'cpq-docmgmt', label: '문서함 (M-5-4)', href: '/cpq/documents', code: 'M-5-4' },
          { id: 'cpq-print', label: 'Print Set-up (S-3-4)', href: '/cpq/print-setup', code: 'S-3-4' },
          { id: 'cpq-reports', label: 'Report Center (RPT)', href: '/cpq/reports', code: 'RPT' },
        ],
      },
    ],
  },
  plm: {
    title: 'PLM Set-up',
    nodes: [
      {
        id: 'plm-root', label: 'Work Process', children: [
          {
            id: 'plm-designmgmt', label: 'Design management', children: [
              { id: 'plm-design', label: 'Design Editor (S-4-1-1)', href: '/plm/design', code: 'S-4-1-1' },
              { id: 'plm-drawings', label: '도면 대장 (M-4-1)', href: '/plm/drawings', code: 'M-4-1' },
            ],
          },
          { id: 'plm-workprocess', label: 'Work Process (S-4-1-2)', href: '/plm/work-process', code: 'S-4-1-2' },
          { id: 'plm-quality', label: 'Quality (M-4-5)', href: '/plm/quality', code: 'M-4-5' },
          { id: 'plm-parts', label: '부품 대장 (M-4-7)', href: '/plm/parts', code: 'M-4-7' },
          { id: 'plm-eco', label: '설계 변경 ECO/ECN (D-5)', href: '/plm/eco-change', code: 'D-5' },
          { id: 'plm-eco-ledger', label: '변경 이력 대장 (D-5L)', href: '/erp/eco-ledger', code: 'D-5L' },
          { id: 'plm-bom-compare', label: 'BOM 비교 (G-3B)', href: '/plm/bom-compare', code: 'G-3B' },
        ],
      },
      {
        id: 'plm-design2', label: 'Design', children: [
          { id: 'plm-duct', label: '건축설비 Duct (M-4-3)', href: '/plm/duct', code: 'M-4-3' },
        ],
      },
      { id: 'plm-arr', label: 'Arrangement Set-Up (M-4-2)', href: '/plm/arrangement', code: 'M-4-2' },
    ],
  },
  code: {
    title: 'Code Management',
    nodes: [
      {
        id: 'code-root', label: 'Sub Code', children: [
          {
            id: 'code-spec', label: 'Specification', children: [
              { id: 'code-subcode', label: 'Sub Code 등록 (S-1-1)', href: '/code/subcode', code: 'S-1-1' },
            ],
          },
          { id: 'code-raw', label: 'Raw Material·GPI (M-3-2)', href: '/code/materials', code: 'M-3-2' },
        ],
      },
      {
        id: 'code-product', label: 'Product Code', children: [
          { id: 'code-master', label: '제품 코드 마스터 (M-3-8)', href: '/code/product-codes', code: 'M-3-8' },
          { id: 'i18n-data', label: '데이터 번역 (M-13-2)', href: '/code/data-i18n', code: 'M-13-2' },
          { id: 'code-relationship', label: 'Code Relationship (S-1-4)', href: '/code/relationship', code: 'S-1-4' },
        ],
      },
      {
        id: 'code-data', label: 'Data', children: [
          { id: 'code-hierarchy', label: 'Hierarchy 주소 (M-3-1)', href: '/code/groups', code: 'M-3-1' },
          { id: 'code-datatable', label: '데이터 Table 관리 (M-3-7)', href: '/code/datatable', code: 'M-3-7' },
          { id: 'code-variant', label: 'Variant·Constant (S-1-2)', href: '/code/variant', code: 'S-1-2' },
        ],
      },
    ],
  },
  erp: {
    title: 'ERP',
    nodes: [
      {
        id: 'erp-sales', label: 'Sales', children: [
          { id: 'erp-project', label: 'Project 등록 (S-3-5)', href: '/erp/projects', code: 'S-3-5' },
          { id: 'erp-sales-order', label: '수주 관리 (D-1)', href: '/erp/sales-order', code: 'D-1' },
          { id: 'erp-milestone', label: '일정·마일스톤 (D-7)', href: '/erp/milestones', code: 'D-7' },
          { id: 'erp-calendar', label: '근무일·휴일 캘린더 (M-8-6)', href: '/erp/holidays', code: 'M-8-6' },
          { id: 'erp-finance', label: '다통화·세금 마스터 (M-13-1)', href: '/erp/finance', code: 'M-13-1' },
        ],
      },
      {
        id: 'erp-purchasing', label: 'Purchasing', children: [
          { id: 'erp-purchase', label: '발주 PR·PO (M-8-2)', href: '/erp/purchase', code: 'M-8-2' },
          { id: 'erp-po', label: '발주 라이프사이클 (G-3)', href: '/erp/po', code: 'G-3' },
          { id: 'erp-inventory', label: '재고 관리 (D-2)', href: '/erp/inventory', code: 'D-2' },
          { id: 'erp-mrp', label: 'MRP 자재 소요 (M-8-5)', href: '/erp/mrp', code: 'M-8-5' },
          { id: 'erp-warehouse', label: '창고·저장위치 (M-8-4)', href: '/erp/warehouses', code: 'M-8-4' },
        ],
      },
      {
        id: 'erp-production', label: 'Production', children: [
          { id: 'erp-work-order', label: '작업지시 (D-3)', href: '/erp/work-order', code: 'D-3' },
          { id: 'erp-quality', label: '검사·품질 (D-4)', href: '/erp/quality', code: 'D-4' },
        ],
      },
      {
        id: 'erp-finance-grp', label: 'Finance', children: [
          { id: 'erp-price', label: '단가 관리 (M-12-5)', href: '/erp/prices', code: 'M-12-5' },
          { id: 'erp-cost-actual', label: '원가 실적·차이분석 (D-6)', href: '/erp/cost-actual', code: 'D-6' },
        ],
      },
      {
        id: 'erp-company', label: 'Company Info.', children: [
          { id: 'erp-dashboard', label: 'Dashboard (M-14-4)', href: '/erp/dashboard', code: 'M-14-4' },
          { id: 'erp-anomaly', label: '이상 이벤트 (M-14-4A)', href: '/erp/anomaly', code: 'M-14-4A' },
          { id: 'erp-company-master', label: '공급처·거래처 (M-14-2)', href: '/erp/companies', code: 'M-14-2' },
          { id: 'erp-process', label: 'Process Set-up (M-14-7)', href: '/erp/process', code: 'M-14-7' },
          { id: 'erp-access', label: '사용자·권한 (M-14-6)', href: '/erp/roles', code: 'M-14-6', minLevel: 'SETUP' },
      { id: 'erp-tenant-menu', label: '테넌트 메뉴 관리 (M-14-6B)', href: '/erp/tenant-menus', code: 'M-14-6B', minLevel: 'SETUP' },
          { id: 'erp-audit', label: '감사 조회 (M-14-6A)', href: '/erp/audit', code: 'M-14-6A', minLevel: 'SETUP' },
          { id: 'erp-tenants', label: '고객사 관리 (M-14-6C)', href: '/erp/tenants', code: 'M-14-6C', minLevel: 'ADMIN' },
        ],
      },
    ],
  },
  toolbox: {
    title: 'EDIM Toolbox',
    nodes: [
      {
        id: 'tbx-uidesign', label: 'UI Design', children: [
          { id: 'tbx-ui', label: 'UI Designer (S-2-1)', href: '/toolbox/ui-designer', code: 'S-2-1' },
        ],
      },
      {
        id: 'tbx-program', label: 'Program Macro', children: [
          { id: 'tbx-macro', label: 'Macro Studio (S-2-2)', href: '/toolbox/macros', code: 'S-2-2' },
        ],
      },
      { id: 'tbx-templet', label: 'Templet 관리 (S-2-3)', href: '/toolbox/templets', code: 'S-2-3' },
      { id: 'tbx-runs', label: 'Run 이력·정리 (E-3)', href: '/toolbox/runs', code: 'E-3' },
      { id: 'tbx-assistant', label: '내부 Q&A (AI-08)', href: '/toolbox/assistant', code: 'AI-08' },
    ],
  },
  common: {
    title: '공통',
    nodes: [
      { id: 'com-approval', label: '승인함 (M-15-2)', href: '/common/approval', code: 'M-15-2' },
      { id: 'com-tasks', label: '부서 업무함 (M-15-3)', href: '/erp/tasks', code: 'M-15-3' },
      { id: 'com-folder', label: 'Project Folder·이력 (M-15-8/9)', href: '/common/folder', code: 'M-15-8' },
      { id: 'com-mobile', label: 'Mobile App 미리보기 (M-16)', href: '/common/mobile', code: 'M-16' },
      {
        id: 'com-detail', label: '상세 조회 (드릴다운)', children: [
          { id: 'detail-code', label: '코드 상세', href: '/detail/code', code: 'DTL-C' },
          { id: 'detail-part', label: '부품 상세 (G3-b)', href: '/detail/part', code: 'G3-b' },
          { id: 'detail-event', label: '이벤트 상세 (E-4)', href: '/detail/event', code: 'E-4' },
          { id: 'detail-output', label: '산출물 문서 상세 (G3-a)', href: '/detail/output', code: 'G3-a' },
        ],
      },
    ],
  },
}

export interface ScreenInfo { id: string; code: string; title: string }

/** pathname → 화면 정보 (MDI 탭 라벨·트리 마킹) */
export const HREF_INFO: Record<string, ScreenInfo> = (() => {
  const out: Record<string, ScreenInfo> = {}
  const walk = (ns: NavNode[]) => ns.forEach((n) => {
    if (n.href) out[n.href] = { id: n.id, code: n.code ?? '', title: n.label.replace(/\s*\([^)]*\)\s*$/, '') }
    if (n.children) walk(n.children)
  })
  Object.values(MENU_TREE).forEach((m) => walk(m.nodes))
  out['/detail/cad-viewer'] = { id: 'detail-cad', code: 'W-11', title: 'CAD 뷰어' }
  return out
})()

/** MDI 파라미터 다중 인스턴스 (P3) — 쿼리가 별도 작업 문서를 뜻하는 화면만 파라미터별 개별 탭.
 *  (sel=·no= 같은 그리드 선택 상태 파라미터는 제외 — 탭 증식 방지) */
export const MDI_PARAMS: Record<string, string[]> = {
  '/plm/work-process': ['code'],
  '/detail/part': ['drawing', 'block'],
  '/detail/code': ['code', 'name'],
  '/detail/event': ['eventId'],
  '/detail/output': ['file', 'folder', 'fileType'],
  '/detail/cad-viewer': ['fileId'],
  '/common/folder': ['project'],
  '/code/datatable': ['name'],
}

/** href → 소유 메뉴 모듈 (경로 접두사와 다를 수 있음 — /erp/tasks 는 공통, /erp/eco-ledger 는 PLM 메뉴 소속) */
const HREF_MODULE: Record<string, ModuleKey> = (() => {
  const out: Record<string, ModuleKey> = {}
  ;(Object.keys(MENU_TREE) as ModuleKey[]).forEach((mk) => {
    const walk = (ns: NavNode[]) => ns.forEach((n) => { if (n.href) out[n.href] = mk; if (n.children) walk(n.children) })
    walk(MENU_TREE[mk].nodes)
  })
  return out
})()

/** pathname → 모듈 (메뉴 소유 모듈 우선, 없으면 첫 세그먼트; detail 은 공통 취급) */
export function moduleOfPath(pathname: string): ModuleKey {
  const owned = HREF_MODULE[pathname]
  if (owned) return owned
  const seg = pathname.split('/')[1] ?? ''
  if (seg === 'detail') return 'common'
  return (MODULES.some((m) => m.id === seg) ? seg : 'erp') as ModuleKey
}

/** id → 노드 (좌측 사용자 목록 복원용) */
export const NODE_BY_ID: Record<string, NavNode> = (() => {
  const out: Record<string, NavNode> = {}
  const walk = (ns: NavNode[]) => ns.forEach((n) => { out[n.id] = n; if (n.children) walk(n.children) })
  Object.values(MENU_TREE).forEach((m) => walk(m.nodes))
  return out
})()

const visible = (n: NavNode, includeSetup: boolean) => includeSetup || n.minLevel !== 'SETUP'

/** 모듈의 리프 전체 (깊이우선, SETUP 필터) — 좌측 목록 기본값·편집 모달 카탈로그 */
export function moduleLeaves(module: ModuleKey, includeSetup: boolean): NavNode[] {
  const out: NavNode[] = []
  const walk = (ns: NavNode[]) => ns.forEach((n) => {
    if (!visible(n, includeSetup)) return
    if (n.href) out.push(n)
    if (n.children) walk(n.children)
  })
  walk(MENU_TREE[module].nodes)
  return out
}

/** 헤더 메뉴바 드롭다운 — 최상위 그룹 = 드롭다운, 3단계 하위 그룹 = 섹션 헤더 + 리프 전개.
 *  최상위 직속 리프는 모듈 타이틀 이름의 합성 드롭다운(<module>-direct)으로 묶는다. */
export interface NavDropdownEntry { kind: 'header' | 'leaf'; node: NavNode }
export interface NavDropdown { id: string; label: string; entries: NavDropdownEntry[] }

export function navDropdowns(module: ModuleKey, includeSetup: boolean): NavDropdown[] {
  const out: NavDropdown[] = []
  let direct: NavNode[] = []
  const flushDirect = () => {
    if (direct.length === 0) return
    out.push({ id: `${module}-direct`, label: MENU_TREE[module].title, entries: direct.map((n) => ({ kind: 'leaf' as const, node: n })) })
    direct = []
  }
  // 그룹 내부 전개: 직속 리프 먼저, 하위 그룹은 섹션 헤더 + 리프 재귀 (헤더 뒤에 무관 리프가 붙지 않도록)
  const expand = (ns: NavNode[], entries: NavDropdownEntry[]) => {
    const vis = ns.filter((n) => visible(n, includeSetup))
    vis.filter((n) => n.href).forEach((n) => entries.push({ kind: 'leaf', node: n }))
    vis.filter((n) => !n.href && n.children?.length).forEach((n) => {
      const sub: NavDropdownEntry[] = []
      expand(n.children!, sub)
      if (sub.some((e) => e.kind === 'leaf')) entries.push({ kind: 'header', node: n }, ...sub)
    })
  }
  MENU_TREE[module].nodes.forEach((n) => {
    if (!visible(n, includeSetup)) return
    if (n.href) { direct.push(n); return }
    flushDirect()
    const entries: NavDropdownEntry[] = []
    expand(n.children ?? [], entries)
    if (entries.some((e) => e.kind === 'leaf')) out.push({ id: n.id, label: n.label, entries })
  })
  flushDirect()
  return out
}

/** U34b — 편집 초안에 폴더 마커 자동 주입: 마커가 없으면 MENU_TREE 그룹 구조를 '#라벨' 마커로 재구성.
 *  (모든 페이지가 폴더 안에 있도록 — 렌더의 폴더 보존 규칙과 동일한 그룹핑) */
export function withFolderMarkers(ids: string[], module: ModuleKey, includeSetup: boolean): string[] {
  // 부분 마커: 첫 마커 이전(루트 구간)만 그룹 주입, 사용자 마커 구간은 그대로 보존
  const firstMarker = ids.findIndex((id) => id.startsWith('#'))
  if (firstMarker >= 0) {
    const head = ids.slice(0, firstMarker)
    const tail = ids.slice(firstMarker)
    return head.length ? [...withFolderMarkers(head, module, includeSetup), ...tail] : ids
  }
  const order = new Map(ids.map((id, i) => [id, i]))
  const vis = (n: NavNode) => includeSetup || n.minLevel !== 'SETUP'
  const leavesOf = (ns: NavNode[]): NavNode[] => ns.filter(vis).flatMap((n) =>
    [...(n.href ? [n] : []), ...(n.children ? leavesOf(n.children) : [])])
  const out: string[] = []
  const used = new Set<string>()
  // 최상위 직속 리프 → 루트 유지 (마커 앞)
  MENU_TREE[module].nodes.filter(vis).forEach((n) => {
    if (n.href && order.has(n.id)) { out.push(n.id); used.add(n.id) }
  })
  // 그룹 → '#라벨' + 소속 리프 (커스텀 순서)
  MENU_TREE[module].nodes.filter(vis).forEach((n) => {
    if (n.href) return
    const leaves = leavesOf(n.children ?? [])
      .filter((l) => order.has(l.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    if (!leaves.length) return
    out.push(`#${n.label}`)
    leaves.forEach((l) => { out.push(l.id); used.add(l.id) })
  })
  // 트리에 없는 잔여 id 는 말미 루트로 보존
  ids.forEach((id) => { if (!used.has(id) && !id.startsWith('#')) out.push(id) })
  return out
}
