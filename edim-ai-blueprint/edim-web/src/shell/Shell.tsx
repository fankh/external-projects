/** 앱 프레임 — 타이틀바 · 메뉴바 · 툴바 · MDI · 좌측 메뉴트리 · 상태바. */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { User } from '../api/types'
import { approvalService, authService, dashboardService, devReqService, menuService, pingBackend, prefService, projectService, searchService, subscribeDataSource, type DataSource, type SearchResults } from '../api/services'
import { MdiTabs, MenuBar, StatusBar, TitleBar, type MenuItem } from '../components/chrome'
import { Btn } from '../components/controls'
import { LnavTree } from '../components/LnavTree'
import { LocaleSwitcher, useI18n } from '../i18n/I18nContext'
import { DevReqDialog } from './DevReqDialog'
import { NotificationBell } from './NotificationBell'
import { usePermission } from './PermissionContext'
import { useShell, type OpenTab } from './ShellContext'
import { MENU_TREE, SCREEN_BY_NODE } from './menus'
import type { TreeNode } from '../components/LnavTree'
import { SelectionScreen } from '../screens/cpq/SelectionScreen'
import { XCodeReviewScreen } from '../screens/cpq/XCodeReviewScreen'
import { TechDataScreen } from '../screens/cpq/TechDataScreen'
import { RunScreen } from '../screens/cpq/RunScreen'
import { ArrangementSetupScreen } from '../screens/plm/ArrangementSetupScreen'
import { DesignEditorScreen } from '../screens/plm/DesignEditorScreen'
import { PartLedgerScreen } from '../screens/plm/PartLedgerScreen'
import { EcoChangeScreen } from '../screens/plm/EcoChangeScreen'
import { BomCompareScreen } from '../screens/plm/BomCompareScreen'
import { QualityScreen } from '../screens/plm/QualityScreen'
import { HierarchyScreen } from '../screens/code/HierarchyScreen'
import { MaterialGpiScreen } from '../screens/code/MaterialGpiScreen'
import { CompanyMasterScreen } from '../screens/erp/CompanyMasterScreen'
import { VariantConstantScreen } from '../screens/code/VariantConstantScreen'
import { TempletMgmtScreen } from '../screens/toolbox/TempletMgmtScreen'
import { DrawingLedgerScreen } from '../screens/plm/DrawingLedgerScreen'
import { WarehouseScreen } from '../screens/erp/WarehouseScreen'
import { WorkProcessScreen } from '../screens/plm/WorkProcessScreen'
import { SubCodeScreen } from '../screens/code/SubCodeScreen'
import { CodeRelationshipScreen } from '../screens/code/CodeRelationshipScreen'
import { DataTableScreen } from '../screens/code/DataTableScreen'
import { DocumentMgmtScreen } from '../screens/cpq/DocumentMgmtScreen'
import { DocTemplateScreen } from '../screens/cpq/DocTemplateScreen'
import { PrintSetupScreen } from '../screens/cpq/PrintSetupScreen'
import { DuctDesignScreen } from '../screens/plm/DuctDesignScreen'
import { AccessControlScreen } from '../screens/erp/AccessControlScreen'
import { AuditQueryScreen } from '../screens/erp/AuditQueryScreen'
import { AnomalyScreen } from '../screens/erp/AnomalyScreen'
import { MacroStudioScreen } from '../screens/toolbox/MacroStudioScreen'
import { RunHistoryScreen } from '../screens/toolbox/RunHistoryScreen'
import { UiDesignerScreen } from '../screens/toolbox/UiDesignerScreen'
import { ApprovalInboxScreen } from '../screens/common/ApprovalInboxScreen'
import { TaskBoxScreen } from '../screens/common/TaskBoxScreen'
import { ProjectFolderScreen } from '../screens/common/ProjectFolderScreen'
import { MobilePreviewScreen } from '../screens/common/MobilePreviewScreen'
import { CadViewerScreen } from '../screens/detail/CadViewerScreen'
import { CodeDetailScreen } from '../screens/detail/CodeDetailScreen'
import { OutputDocScreen } from '../screens/detail/OutputDocScreen'
import { PartDetailScreen } from '../screens/detail/PartDetailScreen'
import { EventDetailScreen } from '../screens/detail/EventDetailScreen'
import { ProjectScreen } from '../screens/erp/ProjectScreen'
import { DashboardScreen } from '../screens/erp/DashboardScreen'
import { PriceScreen } from '../screens/erp/PriceScreen'
import { SalesOrderScreen } from '../screens/erp/SalesOrderScreen'
import { InventoryScreen } from '../screens/erp/InventoryScreen'
import { WorkOrderScreen } from '../screens/erp/WorkOrderScreen'
import { QualityInspectionScreen } from '../screens/erp/QualityInspectionScreen'
import { CostActualScreen } from '../screens/erp/CostActualScreen'
import { MilestoneScreen } from '../screens/erp/MilestoneScreen'
import { ProcessSetupScreen } from '../screens/erp/ProcessSetupScreen'
import { PurchaseScreen } from '../screens/erp/PurchaseScreen'
import { PoOrderScreen } from '../screens/erp/PoOrderScreen'

export interface ScreenProps {
  active: boolean
  tab: OpenTab
}

const SCREENS: Record<string, ComponentType<ScreenProps>> = {
  'cpq-selection': SelectionScreen,
  'cpq-xreview': XCodeReviewScreen,
  'cpq-techdata': TechDataScreen,
  'cpq-run': RunScreen,
  'plm-design': DesignEditorScreen,
  'plm-drawings': DrawingLedgerScreen,
  'plm-workprocess': WorkProcessScreen,
  'code-subcode': SubCodeScreen,
  'code-relationship': CodeRelationshipScreen,
  'code-datatable': DataTableScreen,
  'erp-project': ProjectScreen,
  'erp-dashboard': DashboardScreen,
  'erp-price': PriceScreen,
  'erp-sales-order': SalesOrderScreen,
  'erp-inventory': InventoryScreen,
  'erp-work-order': WorkOrderScreen,
  'erp-quality': QualityInspectionScreen,
  'erp-cost-actual': CostActualScreen,
  'erp-milestone': MilestoneScreen,
  'erp-process': ProcessSetupScreen,
  'erp-purchase': PurchaseScreen,
  'erp-po': PoOrderScreen,
  'cpq-docmgmt': DocumentMgmtScreen,
  'cpq-doctpl': DocTemplateScreen,
  'cpq-print': PrintSetupScreen,
  'plm-duct': DuctDesignScreen,
  'erp-access': AccessControlScreen,
  'erp-audit': AuditQueryScreen,
  'erp-anomaly': AnomalyScreen,
  'tbx-macro': MacroStudioScreen,
  'tbx-ui': UiDesignerScreen,
  'tbx-templet': TempletMgmtScreen,
  'tbx-runs': RunHistoryScreen,
  'plm-arr': ArrangementSetupScreen,
  'code-variant': VariantConstantScreen,
  'code-raw': MaterialGpiScreen,
  'plm-material': MaterialGpiScreen,
  'plm-quality': QualityScreen,
  'erp-company-master': CompanyMasterScreen,
  'code-hierarchy': HierarchyScreen,
  'plm-parts': PartLedgerScreen,
  'plm-eco': EcoChangeScreen,
  'plm-bom-compare': BomCompareScreen,
  'erp-warehouse': WarehouseScreen,
  'com-approval': ApprovalInboxScreen,
  'com-tasks': TaskBoxScreen,
  'com-folder': ProjectFolderScreen,
  'com-mobile': MobilePreviewScreen,
  // 상세 (드릴다운 — 더블클릭으로 진입, params 필수)
  'code-detail': CodeDetailScreen,
  'cad-viewer': CadViewerScreen,
  'doc-detail': OutputDocScreen,
  'part-detail': PartDetailScreen,
  'event-detail': EventDetailScreen,
}

export function Shell(props: { user: User }) {
  const shell = useShell()
  const { t } = useI18n()
  const perm = usePermission()
  const menu = MENU_TREE[shell.module]
  const [source, setSource] = useState<DataSource>('unknown')
  const searchRef = useRef<HTMLInputElement>(null)
  // D10 — 사용자별 표시 모듈 (null=미로딩/전체)
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null)
  // D8 — 화면 즐겨찾기 (서버 영속)
  const [favorites, setFavorites] = useState<{ screenId: string; code: string; title: string }[]>([])
  useEffect(() => {
    void prefService.get<{ screenId: string; code: string; title: string }[]>('favorites')
      .then((f) => { if (Array.isArray(f)) setFavorites(f) })
  }, [])
  const activeTab = shell.tabs.find((tb) => tb.id === shell.activeTabId) ?? null
  const isFav = activeTab ? favorites.some((f) => f.screenId === activeTab.screenId) : false
  const toggleFavorite = () => {
    if (!activeTab) { shell.setStatusMsg('즐겨찾기 — 화면 탭을 먼저 여십시오'); return }
    const exists = favorites.some((f) => f.screenId === activeTab.screenId)
    const next = exists
      ? favorites.filter((f) => f.screenId !== activeTab.screenId)
      : [...favorites, { screenId: activeTab.screenId, code: activeTab.code, title: activeTab.title }]
    setFavorites(next)
    void prefService.set('favorites', next)
    shell.setStatusMsg(exists ? `즐겨찾기 해제 — ${activeTab.title}` : `즐겨찾기 추가 ✓ — ${activeTab.title} (서버 저장)`)
  }
  const openFavorite = (f: { screenId: string; code: string; title: string }) =>
    shell.openTab({ screenId: f.screenId, code: f.code, title: f.title })

  // D8 — 최근 항목 (서버 영속, activeTab 변경 시 기록)
  type RecentItem = { screenId: string; code: string; title: string }
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [recentOpen, setRecentOpen] = useState(false)
  const recentRef = useRef<HTMLSpanElement>(null)
  const recentLoaded = useRef(false)
  useEffect(() => {
    void prefService.get<RecentItem[]>('recent').then((r) => {
      if (Array.isArray(r)) setRecent(r)
      recentLoaded.current = true
    })
  }, [])
  useEffect(() => {
    if (!recentLoaded.current || !activeTab) return
    // 상세/휘발 탭 제외 — 메뉴 화면만 최근에 기록
    if (!SCREEN_BY_NODE[activeTab.screenId]) return
    setRecent((prev) => {
      const item = { screenId: activeTab.screenId, code: activeTab.code, title: activeTab.title }
      const next = [item, ...prev.filter((r) => r.screenId !== item.screenId)].slice(0, 10)
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev
      void prefService.set('recent', next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.screenId])
  useEffect(() => {
    if (!recentOpen) return
    const onDoc = (e: MouseEvent) => {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) setRecentOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [recentOpen])

  useEffect(() => {
    const unsub = subscribeDataSource(setSource)
    void pingBackend()
    void menuService.myModules().then((m) => { if (m) setAllowedModules(m) })
    return unsub
  }, [])

  // D10 — 현재 모듈이 표시 목록에서 빠졌으면 허용된 첫 모듈로 이동
  useEffect(() => {
    if (allowedModules && allowedModules.length && !allowedModules.includes(shell.module)) {
      shell.setModule(allowedModules[0] as typeof shell.module)
    }
  }, [allowedModules, shell])

  // ── 전역 단축키 ──
  //  Ctrl/⌘+K = 검색 · Alt+W = 탭 닫기 · Alt+←/→ = 탭 이동 · Alt+1~9 = n번째 탭
  //  (Ctrl+W·Ctrl+Tab 은 브라우저 예약이라 Alt 조합 사용)
  const { tabs, activeTabId, closeTab, activateTab } = shell
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag0 = (e.target as HTMLElement).tagName
      const inField = tag0 === 'INPUT' || tag0 === 'TEXTAREA' || tag0 === 'SELECT'
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase()
        // Ctrl+F: 그리드에 포커스가 있으면 그리드 내 찾기(DenseGrid)에 양보, 아니면 전역 검색
        if (k === 'f') {
          const ae = document.activeElement as HTMLElement | null
          if (ae && ae.closest('table.g, [data-grid-wrap]')) return
        }
        if (k === 'k' || k === 'f') { e.preventDefault(); searchRef.current?.focus(); return }  // 검색/찾기
        if (k === 's') { e.preventDefault(); fkey('F12'); return }                                 // 저장
        if (k === 'p') { e.preventDefault(); window.print(); return }                              // 인쇄
      }
      // Delete = 삭제(F3) — 입력 필드 밖에서만
      if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && !inField) {
        e.preventDefault(); fkey('F3'); return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const tag = tag0
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tabs.length > 0) {
        e.preventDefault()
        const idx = Math.max(0, tabs.findIndex((t2) => t2.id === activeTabId))
        const n = tabs.length
        const next = e.key === 'ArrowRight' ? (idx + 1) % n : (idx - 1 + n) % n
        activateTab(tabs[next].id)
        return
      }
      const num = Number(e.key)
      if (num >= 1 && num <= 9 && tabs[num - 1]) {
        e.preventDefault()
        activateTab(tabs[num - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activeTabId, closeTab, activateTab])

  // 툴바 아이콘 → 활성 화면의 F-key 디스패치 (useFKeys 가 window keydown 수신)
  const fkey = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))

  // ── 통합 검색 (⌘K · B5) — 화면 레지스트리 + 백엔드 코드·문서·파일 ──
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<SearchResults | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 2) { setSearchRes(null); return }
    const t2 = setTimeout(() => {
      void searchService.query(q).then((r) => { setSearchRes(r); setSearchOpen(true) })
    }, 300)
    return () => clearTimeout(t2)
  }, [searchQ])
  const screenHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (q.length < 2) return []
    return Object.values(SCREEN_BY_NODE)
      .filter((s) => (s.title + ' ' + s.code).toLowerCase().includes(q)).slice(0, 6)
  }, [searchQ])
  const closeSearch = () => { setSearchOpen(false); setSearchQ('') }

  // ── F-key 표준 폴백 — 브라우저 기본동작(F3 찾기 등) 차단 + 미구현 화면 안내 ──
  // Shell 리스너가 먼저 등록되므로 화면 핸들러의 preventDefault 여부는 디스패치 완료 후 확인
  const { setStatusMsg } = shell
  useEffect(() => {
    const LABELS: Record<string, string> = {
      F2: '신규', F3: '삭제', F8: '조회', F9: 'Run', F12: '저장',
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key in LABELS)) return
      e.preventDefault()   // F3 브라우저 찾기 등 차단 — 화면 핸들러는 계속 실행됨
      setTimeout(() => {
        // 화면 useFKeys 핸들러가 처리했다면 자체 상태 메시지를 이미 출력함 — 미처리 시 안내
        if (!(e as KeyboardEvent & { __handled?: boolean }).__handled) {
          setStatusMsg(`${e.key} ${LABELS[e.key]} — 이 화면에는 해당 동작이 없습니다`)
        }
      }, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setStatusMsg])

  // ── 셸 크롬 카운트 (G1) — 승인 대기 = 실 inbox, PL 지연 = 부서 이벤트 delayed 합 ──
  // 초기 + 60초 폴링 + 승인 요청·결정 시 즉시 갱신(edim-inbox-refresh)
  const [inboxCount, setInboxCount] = useState(0)
  const [delayedCount, setDelayedCount] = useState(0)
  useEffect(() => {
    let alive = true
    const loadInbox = () => void approvalService.inbox().then((r) => { if (alive) setInboxCount(r.length) })
    const loadDelayed = () => void dashboardService.get().then(
      (d) => { if (alive) setDelayedCount(d.deptEvents.reduce((s, e) => s + e.delayed, 0)) })
    loadInbox(); loadDelayed()
    const t = setInterval(() => { loadInbox(); loadDelayed() }, 60_000)
    window.addEventListener('edim-inbox-refresh', loadInbox)
    return () => { alive = false; clearInterval(t); window.removeEventListener('edim-inbox-refresh', loadInbox) }
  }, [])

  // ── 메뉴바 드롭다운 ──
  const [showHelp, setShowHelp] = useState(false)
  const [showPw, setShowPw] = useState(false)

  // 개발서버 전용 — 요구사항 접수 (GET /config devMode 게이트, 운영 배포에서는 버튼 자체가 없음)
  const [devMode, setDevMode] = useState(false)
  const [showDevReq, setShowDevReq] = useState(false)
  useEffect(() => { void devReqService.devMode().then(setDevMode) }, [])
  const logout = () => {
    sessionStorage.removeItem('edim-session')
    sessionStorage.removeItem('edim-token')
    window.location.reload()
  }
  useEffect(() => {
    if (!showHelp) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHelp(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [showHelp])
  const stepTab = (dir: 1 | -1) => {
    if (tabs.length === 0) return
    const idx = Math.max(0, tabs.findIndex((t2) => t2.id === activeTabId))
    activateTab(tabs[(idx + dir + tabs.length) % tabs.length].id)
  }
  const menus: Record<string, MenuItem[]> = {
    '파일': [
      { label: t('common.new', '신규'), hint: 'F2', onClick: () => fkey('F2') },
      { label: t('common.save', '저장'), hint: 'F12', onClick: () => fkey('F12') },
      { label: t('common.print', '인쇄'), onClick: () => window.print() },
      { sep: true, label: '' },
      { label: '비밀번호 변경', onClick: () => setShowPw(true) },
      { label: '로그아웃', onClick: logout },
    ],
    '편집': [
      { label: '실행 취소', hint: 'Ctrl+Z', onClick: () => window.dispatchEvent(new CustomEvent('edim-undo')) },
      { label: '다시 실행', hint: 'Ctrl+Y', onClick: () => window.dispatchEvent(new CustomEvent('edim-redo')) },
      { sep: true, label: '' },
      { label: t('common.delete', '삭제'), hint: 'F3', onClick: () => fkey('F3') },
    ],
    '조회': [
      { label: t('common.query', '조회'), hint: 'F8', onClick: () => fkey('F8') },
      { label: 'Run', hint: 'F9', onClick: () => fkey('F9') },
      { sep: true, label: '' },
      { label: '데이터 소스 재확인', onClick: () => {
        void pingBackend()
        shell.setStatusMsg('데이터 소스 재확인 — 상태바 DB 표시 참조')
      } },
    ],
    '도구': [
      { label: 'Macro Studio (S-2-2)', onClick: () => shell.openTab(SCREEN_BY_NODE['tbx-macro']) },
      { label: 'UI Designer (S-2-1)', onClick: () => shell.openTab(SCREEN_BY_NODE['tbx-ui']) },
      { label: '데이터 Table (M-3-7)', onClick: () => shell.openTab(SCREEN_BY_NODE['code-datatable']) },
      { sep: true, label: '' },
      { label: '문서 포털 (docs)', onClick: () => window.open('/docs/', '_blank') },
    ],
    '창': [
      { label: '다음 탭', hint: 'Alt+→', onClick: () => stepTab(1), disabled: tabs.length === 0 },
      { label: '이전 탭', hint: 'Alt+←', onClick: () => stepTab(-1), disabled: tabs.length === 0 },
      { label: '탭 닫기', hint: 'Alt+W', disabled: !activeTabId,
        onClick: () => { if (activeTabId) closeTab(activeTabId) } },
      { label: '모든 탭 닫기', disabled: tabs.length === 0,
        onClick: () => [...tabs].forEach((t2) => closeTab(t2.id)) },
      { sep: true, label: '' },
      ...tabs.slice(0, 12).map((t2) => ({
        label: `${t2.id === activeTabId ? '● ' : ''}${t2.code} ${t(`screen.${t2.screenId}`, t2.title)}`,
        onClick: () => activateTab(t2.id),
      })),
    ],
    '도움말': [
      { label: '단축키 안내', onClick: () => setShowHelp(true) },
      { label: '시연 시나리오 (PDF)', onClick: () => window.open('/docs/files/pdf/EDIM_시연시나리오.pdf', '_blank') },
      { sep: true, label: '' },
      { label: 'EDIM Tool System — NOVA Solution', disabled: true },
    ],
  }

  const SHORTCUTS: [string, string][] = [
    ['F2 / F3 / F8 / F9 / F12', '신규 · 삭제 · 조회 · Run · 저장 (활성 화면)'],
    ['Ctrl(⌘)+K', '검색창 포커스'],
    ['Alt+W', '활성 탭 닫기'],
    ['Alt+← / Alt+→', '이전 / 다음 탭'],
    ['Alt+1 ~ 9', 'n번째 탭 활성화'],
    ['브라우저 뒤로/앞으로', '탭·모듈 이동 이력 따라가기 (URL 동기)'],
    ['CAD: 휠 / 드래그', '커서 기준 줌 / 팬'],
    ['CAD: ＋ − 0', '줌 인 · 줌 아웃 · 맞춤 (더블클릭 동일)'],
    ['CAD: M / Esc', '측정 토글 / 측정·선택 해제'],
    ['그리드 더블클릭', '상세 탭 (코드·문서·부품·이벤트)'],
  ]

  // F1 — 타이틀바 활성 프로젝트 컨텍스트 (prj_project 실데이터, 미선택 시 목록 첫 건 자동)
  const userLabel = useMemo(() => {
    const prj = shell.activeProject
      ? `${shell.activeProject.name} (${shell.activeProject.no})`
      : t('shell.noProject', '프로젝트 미선택')
    return `${prj} · ${props.user.department} · ${props.user.name} [${props.user.userLevel}]`
  }, [props.user, shell.activeProject])

  useEffect(() => {
    if (shell.activeProject) return
    // 저장된 컨텍스트가 없으면 프로젝트 목록 첫 건 (최신 등록순)
    void projectService.list().then((rows) => {
      const p = rows[0]
      if (p) shell.setActiveProject({ no: p.projectNo, name: p.projectName, stage: p.stage })
    }).catch(() => { /* mock/오프라인 — 미선택 유지 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 좌측 트리 라벨 번역 — menu.<nodeId> 키, 미존재 시 KO 라벨 폴백
  // F3 — 권한 없는 메뉴 미표시 (SYS-005): 읽기 자체가 막힌 관리 화면은 GENERAL 트리에서 제거
  const trNodes = useMemo(() => {
    const hidden = perm.canReadAdmin ? new Set<string>() : new Set(['erp-access'])
    const walk = (ns: TreeNode[]): TreeNode[] => ns
      .filter((n) => !hidden.has(n.id))
      .map((n) => ({
        ...n,
        label: t(`menu.${n.id}`, n.label),
        children: n.children ? walk(n.children) : n.children,
      }))
    return walk(menu.nodes)
  }, [menu, t, perm.canReadAdmin])

  // MDI 탭 제목 번역 — screen.<screenId> 키 (상세 탭 등 동적 제목은 키 미정의 → 원제 유지)
  const trTabs = useMemo(
    () => shell.tabs.map((tab) => ({ ...tab, title: t(`screen.${tab.screenId}`, tab.title) })),
    [shell.tabs, t])

  // 페이지 이동 시 좌측 트리 마킹 — 인스턴스 탭(run:1 등)도 screenId 로 메뉴 노드 매칭
  const treeSelId = useMemo(() => {
    const activeTab = shell.tabs.find((t2) => t2.id === shell.activeTabId)
    if (!activeTab) return shell.activeTabId
    return SCREEN_BY_NODE[activeTab.screenId] ? activeTab.screenId : activeTab.id
  }, [shell.tabs, shell.activeTabId])

  return (
    <div className="app">
      <TitleBar user={userLabel} bell={<>
        {devMode ? (
          <span data-devreq-btn title="요구사항 접수 (개발서버 전용)"
            style={{ cursor: 'pointer', fontSize: 13, padding: '0 4px' }}
            onClick={() => setShowDevReq(true)}>📝</span>
        ) : null}
        <LocaleSwitcher /><NotificationBell /></>}
        userMenu={[
          { label: '비밀번호 변경', onClick: () => setShowPw(true) },
          { sep: true, label: '' },
          { label: '로그아웃', onClick: logout },
        ]}
        activeModule={shell.module} onModule={shell.setModule}
        modules={allowedModules as Parameters<typeof TitleBar>[0]['modules']} />
      <MenuBar activeModule={shell.module} onModule={shell.setModule} menus={menus} />
      <div className="toolbar">
        <span className="b ic" title="신규 (F2)" onClick={() => fkey('F2')}>▤</span>
        <span className="b ic" title="저장 (F12)" onClick={() => fkey('F12')}>💾</span>
        <span className="b ic" title="인쇄" onClick={() => window.print()}>🖨</span>
        <span className="sep" />
        <span className="b ic" title="실행 취소 (Ctrl+Z)"
          onClick={() => window.dispatchEvent(new CustomEvent('edim-undo'))}>↶</span>
        <span className="b ic" title="다시 실행 (Ctrl+Y)"
          onClick={() => window.dispatchEvent(new CustomEvent('edim-redo'))}>↷</span>
        <span className="sep" />
        {/* D8 — 화면 즐겨찾기 */}
        <span className="b ic" data-fav-toggle
          title={isFav ? '즐겨찾기 해제' : '현재 화면 즐겨찾기 추가'}
          style={{ color: isFav ? '#E8B84B' : undefined }}
          onClick={toggleFavorite}>{isFav ? '★' : '☆'}</span>
        {favorites.slice(0, 8).map((f) => (
          <span key={f.screenId} className="b" data-fav-chip
            title={`즐겨찾기 — ${f.code} ${f.title}`}
            style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => openFavorite(f)}>★ {f.title}</span>
        ))}
        {/* D8 — 최근 항목 드롭다운 */}
        <span ref={recentRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <span className="b" data-recent-toggle title="최근 연 화면"
            onClick={() => setRecentOpen((o) => !o)}>🕘 최근</span>
          {recentOpen && recent.length ? (
            <div className="gb" style={{
              position: 'absolute', left: 0, top: 22, width: 220, zIndex: 100,
              boxShadow: '0 6px 20px rgba(20,26,40,.28)', textAlign: 'left',
            }}>
              <div className="gc p0" style={{ maxHeight: 300, overflow: 'auto' }}>
                {recent.map((r) => (
                  <div key={r.screenId} data-recent-item className="tn"
                    style={{ cursor: 'pointer', padding: '4px 9px', fontSize: 11 }}
                    onClick={() => { openFavorite(r); setRecentOpen(false) }}>
                    <span style={{ color: 'var(--txt-mute)', fontSize: 9.5 }}>{r.code}</span> {r.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </span>
        <span className="sep" />
        <span className="b" title="VARIANT 바인딩 치수 — Design Editor"
          onClick={() => {
            shell.openTab(SCREEN_BY_NODE['plm-design'])
            shell.setStatusMsg('Variants — VARIANT 바인딩 치수 (Design Editor, Design Rule 그리드)')
          }}>Variants</span>
        <span className="b" title="현재 코드를 참조하는 상위 — 코드 상세"
          onClick={() => {
            // F4 — 활성 컨텍스트 우선: 활성(또는 마지막) 코드 상세 탭의 코드, 없으면 시드 데모 코드
            const detailTabs = shell.tabs.filter((tb) => tb.screenId === 'code-detail')
            const ctx = detailTabs.find((tb) => tb.id === shell.activeTabId) ?? detailTabs[detailTabs.length - 1]
            const code = String(ctx?.params?.code ?? 'KDCR 3-13')
            const name = String(ctx?.params?.name ?? 'Fan 원심 Casing')
            shell.openTab({
              id: `code-detail:${code}`, screenId: 'code-detail',
              code: '상세', title: code, params: { code, name },
            })
            shell.setStatusMsg(`Referencers — ${code} Where-Used (코드 상세)`)
          }}>Referencers</span>
        <span className="b" title="개정 대체 이력 — 도면 대장 (dwg_supersedure)"
          onClick={() => {
            shell.openTab(SCREEN_BY_NODE['plm-drawings'])
            shell.setStatusMsg('Supersedure — 도면 대장(M-4-1) 우측 대체 이력 (dwg_supersedure)')
          }}>Supersedure</span>
        <span style={{ flex: 1 }} />
        <span style={{ position: 'relative' }}>
          <input ref={searchRef} className="in" style={{ width: 200 }}
            value={searchQ}
            placeholder={t('shell.searchPh', '화면·코드·부품·업체·문서 검색 (⌘K)')}
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => { if (searchQ.trim().length >= 2) setSearchOpen(true) }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }} />
          {searchOpen && (screenHits.length || searchRes) ? (
            <div data-search-results style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 70, width: 300,
              maxHeight: 340, overflow: 'auto', background: '#fff',
              border: '1px solid var(--line-strong)', boxShadow: '0 4px 12px rgba(20,26,40,.22)',
              fontSize: 11, color: 'var(--txt)',
            }}>
              {[
                { label: '화면', items: screenHits.map((s) => ({
                  key: `s:${s.screenId}`, text: `${s.code} ${s.title}`,
                  open: () => shell.openTab(s) })) },
                { label: '코드', items: (searchRes?.codes ?? []).map((c) => ({
                  key: `c:${c.code}`, text: `${c.code} — ${c.name}`,
                  open: () => shell.openTab({
                    id: `code-detail:${c.code}`, screenId: 'code-detail',
                    code: '상세', title: c.code, params: { code: c.code, name: c.name } }) })) },
                { label: '문서', items: (searchRes?.docs ?? []).map((d) => ({
                  key: `d:${d.docNo}`, text: `${d.docNo} — ${d.title} (${d.grade})`,
                  open: () => shell.openTab(SCREEN_BY_NODE['cpq-docmgmt']) })) },
                { label: '도면·파일', items: (searchRes?.files ?? []).map((f) => ({
                  key: `f:${f.fileId}`, text: `${f.name} (${f.type})`,
                  open: () => shell.openTab({
                    id: `cad-viewer:${f.fileId}`, screenId: 'cad-viewer',
                    code: 'CAD', title: f.name.slice(0, 16),
                    params: { fileId: f.fileId, name: f.name } }) })) },
                // ── F6 — 확장 그룹 딥링크 ──
                { label: t('search.parts', '부품'), items: (searchRes?.parts ?? []).map((p) => ({
                  key: `p:${p.partNo}`, text: `${p.partNo} — ${p.name}`,
                  open: () => shell.openTab({
                    id: `part-detail:${p.partNo}`, screenId: 'part-detail',
                    code: '부품', title: p.name, params: { partId: p.partNo, name: p.name } }) })) },
                { label: t('search.companies', '공급처·거래처'), items: (searchRes?.companies ?? []).map((c) => ({
                  key: `co:${c.companyId}`, text: `${c.name} (${c.companyType})`,
                  open: () => shell.openTab(SCREEN_BY_NODE['erp-company-master']) })) },
                { label: t('search.warehouses', '창고·위치'), items: (searchRes?.warehouses ?? []).map((w) => ({
                  key: `w:${w.code}`, text: `${w.code} — ${w.name} (${w.locationType})`,
                  open: () => shell.openTab(SCREEN_BY_NODE['erp-warehouse']) })) },
                { label: 'Macro', items: (searchRes?.macros ?? []).map((m) => ({
                  key: `m:${m.name}`, text: `${m.name} (${m.applyType} · ${m.status})`,
                  open: () => shell.openTab(SCREEN_BY_NODE['tbx-macro']) })) },
                { label: t('search.projects', '프로젝트'), items: (searchRes?.projects ?? []).map((p) => ({
                  key: `pr:${p.projectNo}`, text: `${p.projectNo} — ${p.name} (${p.stage})`,
                  open: () => {
                    shell.setActiveProject({ no: p.projectNo, name: p.name, stage: p.stage })
                    shell.openTab(SCREEN_BY_NODE['erp-project'])
                  } })) },
                { label: t('search.users', '사용자'), items: (searchRes?.users ?? []).map((u) => ({
                  key: `u:${u.login}`, text: `${u.login} — ${u.name} [${u.level}]`,
                  open: () => shell.openTab(SCREEN_BY_NODE['erp-access']) })) },
              ].filter((g) => g.items.length > 0).map((g) => (
                <div key={g.label}>
                  <div style={{ background: 'var(--grid-head, #DCE3EE)', padding: '2px 8px', fontWeight: 700, fontSize: 10 }}>{g.label}</div>
                  {g.items.map((it) => (
                    <div key={it.key} style={{ padding: '3px 10px', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF2FA' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                      onClick={() => { it.open(); closeSearch() }}>
                      {it.text}
                    </div>
                  ))}
                </div>
              ))}
              {searchRes === null && screenHits.length === 0 ? (
                <div style={{ padding: 8, color: 'var(--txt-mute)' }}>백엔드 불가 — 화면 검색만 가능</div>
              ) : null}
            </div>
          ) : null}
        </span>
      </div>
      <MdiTabs tabs={trTabs} activeId={shell.activeTabId}
        onActivate={shell.activateTab} onClose={shell.closeTab} />
      <div className="workarea">
        <LnavTree title={shell.module === 'common' ? t('menu.moduleCommon', menu.title) : menu.title}
          nodes={trNodes}
          selectedId={treeSelId}
          onOpen={(n) => {
            const s = SCREEN_BY_NODE[n.id]
            if (s) shell.openTab(s)
          }}
          onSelect={(n) => {
            // 통합 검색 = 전역 ⌘K 검색창 포커스 (B13-2)
            if (n.id === 'com-search') {
              searchRef.current?.focus()
              shell.setStatusMsg('통합 검색 — 화면코드·코드·문서·도면 (⌘K)')
              return
            }
            // 리프 단일클릭도 열기 (더블클릭은 레거시 문법이지만 웹 관례 병행)
            const s = SCREEN_BY_NODE[n.id]
            if (s && !n.children?.length) shell.openTab(s)
          }}
          footer={
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <div className="hd">{t('shell.todo', 'To-Do')}</div>
              <div style={{ padding: '6px 8px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {t('shell.todoApproval', '승인 확인')}<span style={{ flex: 1 }} /><span className={inboxCount > 0 ? 'st warn' : 'st'}>{inboxCount}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {t('shell.todoPl', 'PL 지연')}<span style={{ flex: 1 }} /><span className={delayedCount > 0 ? 'st err' : 'st'}>{delayedCount}</span>
                </div>
              </div>
            </div>
          } />
        <div className="fill-col">
          {shell.tabs.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--txt-mute)', lineHeight: 2 }}>
              {t('shell.openHint', '좌측 메뉴에서 화면을 여십시오')}<br />
              <span style={{ fontSize: 10.5 }}>{t('shell.openHint2', '더블클릭 = 새 탭 (MDI)')}</span>
            </div>
          ) : (
            shell.tabs.map((tab) => {
              const Screen = SCREENS[tab.screenId]
              const active = tab.id === shell.activeTabId
              return (
                <div key={tab.id} className="fill-col"
                  style={active ? undefined : { display: 'none' }}>
                  {Screen ? <Screen active={active} tab={tab} /> : null}
                </div>
              )
            })
          )}
        </div>
      </div>
      <StatusBar
        onFKey={fkey}
        fkeys={[
          { key: 'F2', label: t('common.new', '신규') }, { key: 'F3', label: t('common.delete', '삭제') },
          { key: 'F8', label: t('common.query', '조회') }, { key: 'F9', label: 'Run' },
          { key: 'F12', label: t('common.save', '저장') },
        ]}
        cells={[
          ...(shell.statusMsg ? [shell.statusMsg] : []),
          `${t('shell.pending', '승인 대기')} ${inboxCount}`,
        ]}
        dbLabel={source === 'live'
          ? <span>DB: <b style={{ color: 'var(--ok)' }}>EDIM-PRD (PG16)</b></span>
          : source === 'mock'
            ? <span>DB: <b style={{ color: 'var(--warn)' }}>MOCK</b></span>
            : 'DB: …'} />
      {showHelp ? (
        <div data-help-dialog style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowHelp(false)}>
          <div style={{
            background: '#fff', border: '1px solid var(--line-strong)', width: 480,
            boxShadow: '0 8px 30px rgba(20,26,40,.35)',
          }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>단축키 안내</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowHelp(false)}>✕</span>
            </div>
            <table className="g" style={{ width: '100%' }}>
              <tbody>
                {SHORTCUTS.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ width: 180, fontFamily: 'Consolas, monospace', fontSize: 10.5, padding: '4px 10px', borderBottom: '1px solid var(--line-soft)' }}>{k}</td>
                    <td style={{ fontSize: 11, padding: '4px 10px', borderBottom: '1px solid var(--line-soft)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--txt-mute)' }}>
              Ctrl+W·Ctrl+Tab 은 브라우저 예약키라 Alt 조합을 사용합니다. Esc 또는 바깥 클릭으로 닫기.
            </div>
          </div>
        </div>
      ) : null}
      {showPw ? (
        <PasswordDialog user={props.user}
          onClose={() => setShowPw(false)}
          onDone={() => {
            setShowPw(false)
            shell.setStatusMsg('비밀번호 변경 완료 — 다음 로그인부터 새 비밀번호 (sys_user, 감사 기록)')
          }} />
      ) : null}
      {showDevReq ? (
        <DevReqDialog
          screenId={shell.tabs.find((t2) => t2.id === shell.activeTabId)?.screenId ?? ''}
          canManage={props.user.userLevel === 'SETUP' || props.user.userLevel === 'ADMIN' || props.user.userLevel === 'PLATFORM'}
          onClose={() => setShowDevReq(false)}
          onSaved={(m) => {
            setShowDevReq(false)
            shell.setStatusMsg(m)
          }} />
      ) : null}
    </div>
  )
}

/** 비밀번호 변경 다이얼로그 (B8) — PUT /users/me/password, mock 모드는 정직 거부. */
function PasswordDialog(props: { user: User; onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    if (!cur || !next) { setMsg('현재·새 비밀번호를 입력하십시오'); return }
    if (next !== confirm) { setMsg('새 비밀번호 확인이 일치하지 않습니다'); return }
    setBusy(true)
    void (async () => {
      try {
        await authService.changePassword(cur, next)
        props.onDone()
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e))
        setBusy(false)
      }
    })()
  }

  return (
    <div data-pw-dialog style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 320, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
          <b>비밀번호 변경 — {props.user.userId}</b><span className="sp" />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        <div className="frm c2" style={{ padding: 10 }}>
          <label>현재 비밀번호 *</label>
          <input className="in req" type="password" value={cur} aria-label="현재 비밀번호"
            autoFocus onChange={(e) => setCur(e.target.value)} />
          <label>새 비밀번호 *</label>
          <input className="in req" type="password" value={next} aria-label="새 비밀번호"
            placeholder="4자 이상" onChange={(e) => setNext(e.target.value)} />
          <label>새 비밀번호 확인 *</label>
          <input className="in req" type="password" value={confirm} aria-label="새 비밀번호 확인"
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </div>
        {msg ? (
          <div style={{ padding: '0 10px 6px', fontSize: 11, color: 'var(--err)' }}>{msg}</div>
        ) : null}
        <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'var(--txt-mute)' }}>
          로그인 5회 실패 시 계정이 자동 잠금(LOCKED)되며 관리자 해제가 필요합니다.
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
          <Btn onClick={props.onClose}>취소</Btn>
          <Btn variant="pri" disabled={busy} onClick={submit}>{busy ? '변경 중…' : '변경'}</Btn>
        </div>
      </div>
    </div>
  )
}
