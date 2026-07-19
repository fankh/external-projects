'use client'
/** 앱 셸 — 타이틀바(모듈)·메뉴바·MDI 탭(최근 화면)·모듈 트리·상태바.
 *  MDI 다중탭 → URL 라우팅 대체: 방문 화면을 탭 스트립으로 유지(localStorage), 클릭=이동.
 *  레거시 SPA Shell.tsx 의 크롬 구조 포팅. */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { MenuBar, MdiTabs, StatusBar, TitleBar, type MdiTab, type MenuItem, type NavMenu } from './chrome'
import { DevReqDialog } from './DevReqDialog'
import { GlobalSearch } from './GlobalSearch'
import { LeftNavEditModal } from './LeftNavEdit'
import { LnavTree, type TreeNode } from './LnavTree'
import { HREF_INFO, MENU_TREE, NODE_BY_ID, moduleOfPath, navDropdowns, type ModuleKey, type NavNode } from './menus'
import { changePassword, firstProject, getFavorites, saveBranding, saveFavorites, saveHeadNav, saveLeftNav, saveTenantHeadNav, saveTenantNav, shellCounts, type FavItem, type LeftNavPref, type ShellPanelData } from './shellActions'

/** U11 색상 테마 프리셋 (슬라이드 57) — globals.css body[data-theme] 토큰. */
const THEMES: { id: string; label: string }[] = [
  { id: '', label: '기본 (Navy)' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'forest', label: 'Forest' },
  { id: 'burgundy', label: 'Burgundy' },
]

/** F1 — 활성 프로젝트 컨텍스트 (레거시 SPA 동일 키) */
const PROJECT_KEY = 'edim-active-project'
interface ActiveProject { no: string; name: string; stage: string }
function loadActiveProject(): ActiveProject | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROJECT_KEY) ?? 'null') as ActiveProject | null
    return p && typeof p.no === 'string' && typeof p.name === 'string' ? p : null
  } catch { return null }
}

const TABS_KEY = 'edim-next-tabs'
const MAX_TABS = 12

function loadTabs(): MdiTab[] {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]') as MdiTab[] } catch { return [] }
}

export function AppChrome(props: {
  // v32.4 — 메뉴 커스텀 SSR (사용자 지시: 서버사이드 렌더): 레이아웃에서 4종 pref 서버 fetch
  initialLeftNav?: LeftNavPref
  initialTenantNav?: LeftNavPref
  initialHeadNav?: LeftNavPref
  initialTenantHeadNav?: LeftNavPref
  user: string
  canReadAdmin: boolean
  bell?: ReactNode
  right?: ReactNode          // 로그아웃 폼 (서버 액션)
  logo?: string              // U11 — 테넌트 로고
  allowedModules?: string[]  // D10 — 표시 모듈 (undefined = 전체)
  devMode?: boolean          // 개발서버 전용 — 요구사항 접수 📝
  children: ReactNode
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const module = moduleOfPath(pathname)
  // 개발서버 전용 — 요구사항 접수 (레거시 Shell 이식)
  const [devReqOpen, setDevReqOpen] = useState(false)
  const [shellMsg, setShellMsg] = useState<string | null>(null)
  // D10 — 표시 모듈 제한: 차단 모듈 직접 진입 시 첫 허용 모듈로
  useEffect(() => {
    const allowed = props.allowedModules
    if (!allowed || allowed.length === 0 || allowed.includes(module)) return
    router.replace(`/${allowed[0]}`)
  }, [module, props.allowedModules, router])

  // ── MDI 탭 (최근 화면) — 방문 시 upsert, 새로고침 간 유지 ──
  const [tabs, setTabs] = useState<MdiTab[]>([])
  useEffect(() => { setTabs(loadTabs()) }, [])
  useEffect(() => {
    const info = HREF_INFO[pathname]
    if (!info) return
    setTabs((cur) => {
      if (cur.some((x) => x.id === pathname)) return cur
      const next = [...cur, { id: pathname, code: info.code, title: info.title }].slice(-MAX_TABS)
      try { localStorage.setItem(TABS_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [pathname])
  const closeTab = useCallback((id: string) => {
    setTabs((cur) => {
      const next = cur.filter((x) => x.id !== id)
      try { localStorage.setItem(TABS_KEY, JSON.stringify(next)) } catch { /* quota */ }
      if (id === pathname) router.push(next.length ? next[next.length - 1].id : '/')
      return next
    })
  }, [pathname, router])
  const trTabs = useMemo(
    () => tabs.map((tab) => {
      const info = HREF_INFO[tab.id]
      return info ? { ...tab, title: t(`menu.${info.id}`, tab.title).replace(/\s*\([^)]*\)\s*$/, '') } : tab
    }), [tabs, t])

  // ── 좌측 사용자 메뉴 목록 (/prefs/leftnav) — 모듈별 leaf id 순서, 부재 = 기본 전체 트리 ──
  // v32.4 — SSR 초기값 (레이아웃 서버 fetch) — 첫 HTML 부터 커스텀 트리, 깜빡임 없음
  const [leftNav, setLeftNav] = useState<LeftNavPref>(props.initialLeftNav ?? {})
  const leftNavLoaded = true
  // U30 — 테넌트 기본 메뉴 (관리자 지정): 개인 pref > 테넌트 기본 > 전체 트리
  const [tenantNav, setTenantNav] = useState<LeftNavPref>(props.initialTenantNav ?? {})
  const applyTenantNav = useCallback((ids: string[]) => {
    setTenantNav((cur) => {
      const next = { ...cur, [module]: ids }
      void saveTenantNav(next)
      return next
    })
  }, [module])
  const applyLeftNav = useCallback((ids?: string[]) => {
    setLeftNav((cur) => {
      const next = { ...cur }
      if (ids) next[module] = ids
      else delete next[module]
      void saveLeftNav(next)
      return next
    })
  }, [module])
  const [navEditOpen, setNavEditOpen] = useState(false)
  const [shortcutOpen, setShortcutOpen] = useState(false)

  // ── U21 헤더 드롭다운 사용자 목록 (/prefs/headnav) — 부재 = 기본 전체 드롭다운 ──
  const [headNav, setHeadNav] = useState<LeftNavPref>(props.initialHeadNav ?? {})
  const headNavLoaded = true
  const [tenantHeadNav, setTenantHeadNav] = useState<LeftNavPref>(props.initialTenantHeadNav ?? {})
  const applyTenantHeadNav = useCallback((ids: string[]) => {
    setTenantHeadNav((cur) => {
      const next = { ...cur, [module]: ids }
      void saveTenantHeadNav(next)
      return next
    })
  }, [module])
  const applyHeadNav = useCallback((ids?: string[]) => {
    setHeadNav((cur) => {
      const next = { ...cur }
      if (ids) next[module] = ids
      else delete next[module]
      void saveHeadNav(next)
      return next
    })
  }, [module])
  const [headEditOpen, setHeadEditOpen] = useState(false)

  // ── 좌측 판넬 접기/펼치기 (localStorage 영속) ──
  const [lnavCollapsed, setLnavCollapsed] = useState(false)
  useEffect(() => {
    try { setLnavCollapsed(localStorage.getItem('edim-lnav-collapsed') === '1') } catch { /* quota */ }
  }, [])
  const toggleLnav = useCallback(() => {
    setLnavCollapsed((c) => {
      try { localStorage.setItem('edim-lnav-collapsed', c ? '0' : '1') } catch { /* quota */ }
      return !c
    })
  }, [])

  // ── U11 판넬 리사이즈 — 좌측 트리 폭 드래그 조절 (localStorage 영속) ──
  const [navW, setNavW] = useState(220)
  const navWRef = useRef(220)
  navWRef.current = navW
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem('edim-lnav-width'))
      if (w >= 140 && w <= 420) setNavW(w)
    } catch { /* quota */ }
  }, [])
  const startNavResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const sx = e.clientX
    const sw = navWRef.current
    const onMove = (ev: MouseEvent) => setNavW(Math.min(420, Math.max(140, sw + ev.clientX - sx)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('edim-lnav-width', String(navWRef.current)) } catch { /* quota */ }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── 모듈 트리 — 커스텀(개인/테넌트) 존재 시 폴더 구조 유지 + 포함·순서만 적용, 없으면 기본 전체 트리 ──
  const custom = leftNavLoaded ? (leftNav[module] ?? tenantNav[module]) : undefined
  const trNodes = useMemo(() => {
    if (custom) {
      // U34 — '#이름' 폴더 마커: 사용자/테넌트 정의 폴더로 재편 (마커 이후 리프가 해당 폴더 소속)
      if (custom.some((id) => id.startsWith('#'))) {
        const vis0 = (n: NavNode | undefined): n is NavNode =>
          !!n?.href && (props.canReadAdmin || n.minLevel !== 'SETUP')
        const out: TreeNode[] = []
        let bucket: TreeNode[] = out
        custom.forEach((entry, i) => {
          if (entry.startsWith('#')) {
            const name = entry.slice(1).trim() || '폴더'
            const folder: TreeNode = { id: `folder:${i}:${name}`, label: name, children: [] }
            out.push(folder)
            bucket = folder.children!
            return
          }
          const n = NODE_BY_ID[entry]
          if (vis0(n)) bucket.push({ id: n.id, href: n.href, label: t(`menu.${n.id}`, n.label) })
        })
        return out.filter((x) => x.href || (x.children && x.children.length))
      }
      // 폴더 보존 렌더: 그룹은 트리 순서 유지, 리프는 커스텀 포함 집합·순서 적용, 빈 그룹 생략
      const order = new Map(custom.map((id, i) => [id, i]))
      const vis = (n: NavNode) => props.canReadAdmin || n.minLevel !== 'SETUP'
      const walkC = (ns: NavNode[]): TreeNode[] => ns.filter(vis).flatMap((n): TreeNode[] => {
        if (n.href) {
          return order.has(n.id)
            ? [{ id: n.id, href: n.href, label: t(`menu.${n.id}`, n.label) }]
            : []
        }
        const children = walkC(n.children ?? [])
          .sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999))
        return children.length ? [{ id: n.id, label: t(`menu.${n.id}`, n.label), children }] : []
      })
      return walkC(MENU_TREE[module].nodes)
    }
    const walk = (ns: NavNode[]): TreeNode[] => ns
      .filter((n) => props.canReadAdmin || n.minLevel !== 'SETUP')
      .map((n) => ({
        id: n.id,
        href: n.href,
        label: t(`menu.${n.id}`, n.label),
        children: n.children ? walk(n.children) : undefined,
      }))
    return walk(MENU_TREE[module].nodes)
  }, [module, t, props.canReadAdmin, custom])
  const selectedId = HREF_INFO[pathname]?.id ?? null

  // ── 헤더 카테고리 드롭다운 — 모듈 그룹 → 상단 메뉴바 (원본 PPT Head 메뉴) ──
  // U21: 사용자 목록 존재 시 그 순서·구성으로 재구성 (그룹 = 최초 등장 순, 섹션 헤더 생략)
  const headCustom = headNavLoaded ? (headNav[module] ?? tenantHeadNav[module]) : undefined
  const navMenus: NavMenu[] = useMemo(() => {
    const drops = navDropdowns(module, props.canReadAdmin)
    if (headCustom) {
      const groupOf = new Map<string, { id: string; label: string }>()
      drops.forEach((d) => d.entries.forEach((e) => { if (e.kind === 'leaf') groupOf.set(e.node.id, { id: d.id, label: d.label }) }))
      const ordered: NavMenu[] = []
      headCustom.forEach((id) => {
        const n = NODE_BY_ID[id]
        const g = groupOf.get(id)
        if (!n?.href || !g) return
        let menu = ordered.find((m) => m.key === g.id)
        if (!menu) { menu = { key: g.id, label: t(`menu.${g.id}`, g.label), items: [] }; ordered.push(menu) }
        menu.items.push({
          label: t(`menu.${n.id}`, n.label).replace(/\s*\([^)]*\)\s*$/, ''),
          hint: n.code,
          onClick: () => router.push(n.href!),
        })
      })
      return ordered
    }
    return drops.map((d) => ({
      key: d.id,
      label: t(`menu.${d.id}`, d.label),
      items: d.entries.flatMap((e, i): MenuItem[] => e.kind === 'header'
        ? [...(i > 0 ? [{ sep: true, label: '' }] : []), { label: t(`menu.${e.node.id}`, e.node.label), header: true }]
        : [{
            label: t(`menu.${e.node.id}`, e.node.label).replace(/\s*\([^)]*\)\s*$/, ''),
            hint: e.node.code,
            onClick: () => router.push(e.node.href!),
          }]),
    }))
  }, [module, props.canReadAdmin, t, router, headCustom])

  // ── 메뉴바 드롭다운 ──
  const stepTab = useCallback((dir: 1 | -1) => {
    if (tabs.length === 0) return
    const idx = Math.max(0, tabs.findIndex((x) => x.id === pathname))
    router.push(tabs[(idx + dir + tabs.length) % tabs.length].id)
  }, [tabs, pathname, router])

  // ── 전역 단축키 (N6 복구) — Alt+W/←→/1~9 · Ctrl(⌘)+K · F2/F3/F8/F9/F12 → edim-fkey ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); window.dispatchEvent(new Event('edim-focus-search')); return
      }
      if (e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(pathname); return }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); stepTab(1); return }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); stepTab(-1); return }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1]
        if (t) { e.preventDefault(); router.push(t.id) }
        return
      }
      if (!editing && /^F(2|3|5|8|9|12)$/.test(e.key)) {
        e.preventDefault(); window.dispatchEvent(new CustomEvent('edim-fkey', { detail: e.key }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, pathname, router, closeTab, stepTab])

  // ── 화면 즐겨찾기 (D8, P2) — /prefs/favorites 서버 영속 ──
  const [favs, setFavs] = useState<FavItem[]>([])
  useEffect(() => { void getFavorites().then(setFavs) }, [])
  const curInfo = HREF_INFO[pathname]
  const isFav = curInfo != null && favs.some((f) => f.href === pathname)
  const toggleFav = () => {
    if (!curInfo) return
    const next = isFav
      ? favs.filter((f) => f.href !== pathname)
      : [...favs, { href: pathname, code: curInfo.code, title: curInfo.title }]
    setFavs(next)
    void saveFavorites(next)
  }
  const favLabel = (f: FavItem) => {
    const info = HREF_INFO[f.href]
    return (info ? t(`menu.${info.id}`, f.title) : f.title).replace(/\s*\([^)]*\)\s*$/, '')
  }

  // ── F1 활성 프로젝트 컨텍스트 — localStorage + 미선택 시 첫 프로젝트 시드 + edim-set-project 수신 ──
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null)
  useEffect(() => {
    const stored = loadActiveProject()
    if (stored) { setActiveProject(stored); return }
    void firstProject().then((p) => {
      if (!p) return
      setActiveProject(p)
      try { localStorage.setItem(PROJECT_KEY, JSON.stringify(p)) } catch { /* quota */ }
    })
  }, [])
  useEffect(() => {
    const onSet = (e: Event) => {
      const p = (e as CustomEvent).detail as ActiveProject
      if (!p?.no) return
      setActiveProject(p)
      try { localStorage.setItem(PROJECT_KEY, JSON.stringify(p)) } catch { /* quota */ }
    }
    window.addEventListener('edim-set-project', onSet)
    return () => window.removeEventListener('edim-set-project', onSet)
  }, [])
  const userLabel = activeProject
    ? `${activeProject.name} (${activeProject.no}) · ${props.user}`
    : props.user

  // ── 셸 크롬 카운트+To-do 패널 (P2/U14) — inbox 상위 3·PL 지연·임박 마일스톤 ──
  //    초기 + 라우팅 변경 + 60초 폴링 + edim-inbox-refresh(승인 결정) 즉시 갱신
  const [counts, setCounts] = useState<ShellPanelData>({ inbox: 0, delayed: 0, inboxTop: [], upcoming: [], done: [], msDates: [] })
  useEffect(() => {
    let alive = true
    const load = () => void shellCounts().then((c) => { if (alive) setCounts(c) })
    load()
    const timer = setInterval(load, 60_000)
    window.addEventListener('edim-inbox-refresh', load)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('edim-inbox-refresh', load) }
  }, [pathname])

  // ── U11 색상 테마 — localStorage 영속, body[data-theme] 적용 ──
  const [theme, setTheme] = useState('')
  useEffect(() => {
    try {
      const v = localStorage.getItem('edim-theme') ?? ''
      setTheme(v)
      if (v) document.body.dataset.theme = v
    } catch { /* quota */ }
  }, [])
  const applyTheme = useCallback((id: string) => {
    setTheme(id)
    if (id) document.body.dataset.theme = id
    else delete document.body.dataset.theme
    try { localStorage.setItem('edim-theme', id) } catch { /* quota */ }
  }, [])

  // ── U11 로고 설정 다이얼로그 (ADMIN) ──
  const [logoOpen, setLogoOpen] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [logoPending, startLogo] = useTransition()
  const uploadLogo = (file: File | null) => {
    if (!file) return
    if (file.size > 48 * 1024) { setLogoMsg({ text: '48KB 이하 이미지를 사용하십시오', err: true }); return }
    const reader = new FileReader()
    reader.onload = () => startLogo(async () => {
      const r = await saveBranding(String(reader.result))
      setLogoMsg(r.error ? { text: r.error, err: true } : { text: r.ok ?? '완료' })
      if (r.ok) setTimeout(() => window.location.reload(), 800)
    })
    reader.readAsDataURL(file)
  }

  // ── 비밀번호 변경 다이얼로그 (B8) ──
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCur, setPwCur] = useState(''); const [pwNew, setPwNew] = useState('')
  const [pwMsg, setPwMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pwPending, startPw] = useTransition()
  const menus: Record<string, MenuItem[]> = {
    '파일': [
      { label: t('common.print', '인쇄'), onClick: () => window.print() },
      { label: t('shell.changePw', '비밀번호 변경'), onClick: () => { setPwMsg(null); setPwOpen(true) } },
      { sep: true, label: '' },
      { label: t('shell.theme', '색상 테마'), header: true },
      ...THEMES.map((th) => ({
        label: `${theme === th.id ? '● ' : ''}${th.label}`,
        onClick: () => applyTheme(th.id),
      })),
      ...(props.canReadAdmin ? [
        { sep: true, label: '' },
        { label: t('shell.logoSetting', '회사 로고 설정'), onClick: () => { setLogoMsg(null); setLogoOpen(true) } },
      ] : []),
      { sep: true, label: '' },
      { label: t('shell.logout', '로그아웃'), onClick: () => {
        document.querySelector<HTMLFormElement>('form[data-logout]')?.requestSubmit()
      } },
    ],
    '도구': [
      { label: 'Macro Studio (S-2-2)', onClick: () => router.push('/toolbox/macros') },
      { label: 'UI Designer (S-2-1)', onClick: () => router.push('/toolbox/ui-designer') },
      { label: t('shell.dataTable', '데이터 Table (M-3-7)'), onClick: () => router.push('/code/datatable') },
      { sep: true, label: '' },
      { label: t('shell.docsPortal', '문서 포털 (docs)'), onClick: () => window.open('/docs/', '_blank') },
    ],
    '창': [
      { label: t('shell.nextTab', '다음 탭'), hint: 'Alt+→', onClick: () => stepTab(1), disabled: tabs.length === 0 },
      { label: t('shell.prevTab', '이전 탭'), hint: 'Alt+←', onClick: () => stepTab(-1), disabled: tabs.length === 0 },
      { label: t('shell.closeTab', '탭 닫기'), disabled: !HREF_INFO[pathname],
        onClick: () => closeTab(pathname) },
      { label: t('shell.closeAllTabs', '모든 탭 닫기'), disabled: tabs.length === 0,
        onClick: () => { setTabs([]); try { localStorage.setItem(TABS_KEY, '[]') } catch { /* quota */ } } },
      { sep: true, label: '' },
      ...trTabs.slice(0, 12).map((tab) => ({
        label: `${tab.id === pathname ? '● ' : ''}${tab.code} ${tab.title}`,
        onClick: () => router.push(tab.id),
      })),
    ],
    '도움말': [
      { label: t('shell.shortcuts', '단축키 안내'), onClick: () => setShortcutOpen(true) },
      { label: t('shell.demoScenario', '시연 시나리오 (PDF)'), onClick: () => window.open('/docs/files/pdf/EDIM_시연시나리오.pdf', '_blank') },
      { sep: true, label: '' },
      { label: 'EDIM Tool System — NOVA Solution', disabled: true },
    ],
  }

  const moduleTitle = module === 'common'
    ? t('menu.moduleCommon', MENU_TREE[module].title) : MENU_TREE[module].title

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar user={userLabel} bell={<>
        {props.devMode ? (
          <span data-devreq-btn title={t('devreq.btnHint', '요구사항 접수 (개발서버 전용)')}
            style={{ cursor: 'pointer', fontSize: 13, padding: '0 4px' }}
            onClick={() => setDevReqOpen(true)}>📝</span>
        ) : null}
        {props.bell}</>} right={props.right} logo={props.logo} allowed={props.allowedModules}
        activeModule={module} onModule={(m: ModuleKey) => router.push(`/${m}`)} />
      <MenuBar menus={menus} extra={navMenus} right={
        <>
          {/* U21 — 헤더 메뉴 편집 (Head Item 추가/제거/재정렬, /prefs/headnav) */}
          <span className="b ic" data-hnav-edit
            title={t('shell.headEdit', '헤더 메뉴 편집 — Head Item 추가·제거·재정렬')}
            style={{ marginLeft: 8 }} onClick={() => setHeadEditOpen(true)}>✎</span>
          {/* D8 — 화면 즐겨찾기: ★ 토글 + 칩 (최대 8) */}
          <span className="b ic" data-fav-toggle
            title={curInfo ? (isFav ? t('shell.favRemove', '즐겨찾기 해제') : t('shell.favAdd', '현재 화면 즐겨찾기 추가')) : t('shell.favNoScreen', '즐겨찾기 — 화면을 먼저 여십시오')}
            style={{ color: isFav ? '#E8B84B' : undefined, cursor: curInfo ? 'pointer' : 'default', marginLeft: 8 }}
            onClick={toggleFav}>{isFav ? '★' : '☆'}</span>
          {favs.slice(0, 5).map((f) => (
            <span key={f.href} className="b" data-fav-chip
              title={`${t('shell.favorite', '즐겨찾기')} — ${f.code} ${favLabel(f)}`}
              style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onClick={() => router.push(f.href)}>★ {favLabel(f)}</span>
          ))}
          <GlobalSearch />
        </>
      } />
      {pwOpen ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPwOpen(false)}>
          <div className="gb" style={{ width: 320, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('shell.changePw', '비밀번호 변경')}</div>
            <input className="in req" type="password" placeholder={t('shell.currentPw', '현재 비밀번호')} value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
            <input className="in req" type="password" placeholder={t('shell.newPw', '새 비밀번호')} value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            {pwMsg ? <div style={{ color: pwMsg.err ? 'var(--err)' : 'var(--run)' }}>{pwMsg.text}</div> : null}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button className="b run" disabled={pwPending} onClick={() => startPw(async () => {
                const r = await changePassword(pwCur, pwNew)
                setPwMsg(r.error ? { text: r.error, err: true } : { text: r.ok ?? t('enum.done', '완료') })
                if (r.ok) { setPwCur(''); setPwNew(''); setTimeout(() => setPwOpen(false), 900) }
              })}>{t('shell.changeBtn', '변경')}</button>
              <button className="b" onClick={() => setPwOpen(false)}>{t('common.close', '닫기')}</button>
            </div>
          </div>
        </div>
      ) : null}
      <MdiTabs tabs={trTabs} activeId={pathname}
        onActivate={(id) => router.push(id)} onClose={closeTab} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {lnavCollapsed ? (
          // 접힌 좌측 레일 — 클릭으로 펼침
          <div data-lnav-expand onClick={toggleLnav} title={t('shell.expand', '펼치기')}
            style={{ width: 22, flexShrink: 0, borderRight: '1px solid var(--line)', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 6,
              background: 'var(--panel, #F4F6FA)' }}>
            <span style={{ fontSize: 11 }}>»</span>
            <span style={{ writingMode: 'vertical-rl', fontSize: 9.5, color: 'var(--txt-mute)' }}>{moduleTitle}</span>
          </div>
        ) : (
        <LnavTree title={moduleTitle} nodes={trNodes} selectedId={selectedId}
          onSelect={(n) => { if (n.href) router.push(n.href) }} width={navW}
          headerAction={
            <span style={{ display: 'inline-flex', gap: 2 }}>
              <span className="b ic" data-lnav-edit title={t('shell.menuEdit', '메뉴 편집')}
                style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => setNavEditOpen(true)}>✎</span>
              <span className="b ic" data-lnav-collapse title={t('shell.collapse', '접기')}
                style={{ cursor: 'pointer', fontSize: 11 }} onClick={toggleLnav}>«</span>
            </span>
          }
          emptyHint={t('shell.leftNavEmpty', '표시할 메뉴가 없습니다 — ✎ 메뉴 편집')}
          footer={
            <div style={{ borderTop: '1px solid var(--line)' }} data-todo-panel>
              <div className="hd">{t('shell.todo', 'To-Do')}</div>
              <div style={{ padding: '4px 8px 6px', fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* U14 — 승인 inbox 상위 3 미니 그리드 */}
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => router.push('/common/approval')} title={t('shell.todoApprovalHint', '승인함 열기')}>
                  {t('shell.todoApproval', '승인 확인')}<span style={{ flex: 1 }} /><span className={counts.inbox > 0 ? 'st warn' : 'st'}>{counts.inbox}</span>
                </div>
                {counts.inboxTop.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 4, cursor: 'pointer', paddingLeft: 6 }}
                    onClick={() => router.push('/common/approval')}>
                    <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, flexShrink: 0 }}>{r.assetType}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.target}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => router.push('/erp/dashboard')} title={t('shell.todoPlHint', '대시보드 열기')}>
                  {t('shell.todoPl', 'PL 지연')}<span style={{ flex: 1 }} /><span className={counts.delayed > 0 ? 'st err' : 'st'}>{counts.delayed}</span>
                </div>
                {/* U14 — Done items: 최근 승인 결과 3 */}
                {counts.done.length ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => router.push('/common/approval')}>
                      {t('shell.doneItems', 'Done items')}<span style={{ flex: 1 }} />
                    </div>
                    {counts.done.map((d, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, paddingLeft: 6, color: 'var(--txt-dim)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.title}</span>
                        <span style={{ fontSize: 9.5, color: 'var(--txt-mute)', flexShrink: 0 }}>{d.at.slice(0, 5)}</span>
                      </div>
                    ))}
                  </>
                ) : null}
                {/* U14 — Schedule: 임박/지연 마일스톤 상위 3 */}
                {counts.upcoming.length ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => router.push('/erp/milestones')} title={t('shell.scheduleHint', '마일스톤 열기')}>
                      {t('shell.schedule', 'Schedule')}<span style={{ flex: 1 }} />
                    </div>
                    {counts.upcoming.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, cursor: 'pointer', paddingLeft: 6 }}
                        onClick={() => router.push('/erp/milestones')}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.projectNo} {m.stageLabel}</span>
                        <span style={{ fontSize: 9.5, color: m.delayStatus === 'OVERDUE' ? 'var(--err)' : 'var(--warn, #B4820B)', flexShrink: 0 }}>{m.plannedDate.slice(5)}</span>
                      </div>
                    ))}
                  </>
                ) : null}
                {/* U14 — 미니 달력: 이번 달 마일스톤 납기 마킹 */}
                <MiniCalendar dates={counts.msDates} onOpen={() => router.push('/erp/milestones')} />
              </div>
            </div>
          } />
        )}
        {/* U11 — 트리 폭 드래그 핸들 (펼침 상태만) */}
        {!lnavCollapsed ? (
          <div data-lnav-resize onMouseDown={startNavResize}
            style={{ width: 4, cursor: 'col-resize', flexShrink: 0, background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--line)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }} />
        ) : null}
        <main className="workarea" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {props.children}
        </main>
      </div>
      <LeftNavEditModal open={headEditOpen} onClose={() => setHeadEditOpen(false)}
        module={module} canReadAdmin={props.canReadAdmin}
        value={headNav[module]} onSave={applyHeadNav}
        onSaveTenant={props.canReadAdmin ? applyTenantHeadNav : undefined}
        title={t('shell.headEditTitle', '헤더 메뉴 편집')} />
      <LeftNavEditModal open={navEditOpen} onClose={() => setNavEditOpen(false)}
        onSaveTenant={props.canReadAdmin ? applyTenantNav : undefined}
        module={module} canReadAdmin={props.canReadAdmin}
        value={leftNav[module]} onSave={applyLeftNav} />
      {/* P3 — 단축키 안내 */}
      {shortcutOpen ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShortcutOpen(false)}>
          <div className="gb" data-shortcut-dialog style={{ width: 380, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('shell.shortcuts', '단축키 안내')}</div>
            <table className="g" style={{ width: '100%' }}>
              <tbody>
                {[
                  ['Ctrl(⌘)+K', t('shell.scGlobalSearch', '통합 검색 포커스')],
                  ['Alt+← / →', t('shell.scTabMove', 'MDI 탭 이동')],
                  ['Alt+1~9', t('shell.scTabJump', '탭 번호 선택')],
                  ['Alt+W', t('shell.scTabClose', '탭 닫기')],
                  ['F2 / F3 / F8', t('shell.scFkeyCrud', '신규 · 삭제 · 조회 (활성 화면)')],
                  ['F9 / F12', t('shell.scFkeyRun', 'Run · 저장 (활성 화면)')],
                  ['Ctrl+F', t('shell.scGridFind', '그리드 내 찾기')],
                  ['Esc', t('shell.scEsc', '다이얼로그 닫기')],
                ].map(([k, d]) => (
                  <tr key={k}><td className="code" style={{ width: 110 }}>{k}</td><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="b" onClick={() => setShortcutOpen(false)}>{t('common.close', '닫기')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {/* U11 — 로고 설정 다이얼로그 (ADMIN) */}
      {logoOpen ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLogoOpen(false)}>
          <div className="gb" data-logo-dialog style={{ width: 340, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('shell.logoSetting', '회사 로고 설정')}</div>
            <div style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('shell.logoHint', '타이틀바에 표시할 로고 이미지 (PNG/SVG, 48KB 이하 권장 높이 18px 배율)')}</div>
            <input type="file" accept="image/*" className="in" disabled={logoPending}
              onChange={(e) => uploadLogo(e.target.files?.[0] ?? null)} />
            {props.logo ? (
              <button className="b" disabled={logoPending} onClick={() => startLogo(async () => {
                const r = await saveBranding('')
                setLogoMsg(r.error ? { text: r.error, err: true } : { text: r.ok ?? '완료' })
                if (r.ok) setTimeout(() => window.location.reload(), 800)
              })}>{t('shell.logoRemove', '로고 제거 (기본 E 마크)')}</button>
            ) : null}
            {logoMsg ? <div style={{ color: logoMsg.err ? 'var(--err)' : 'var(--run)' }}>{logoMsg.text}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="b" onClick={() => setLogoOpen(false)}>{t('common.close', '닫기')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {devReqOpen ? (
        <DevReqDialog screenId={HREF_INFO[pathname]?.id ?? ''} canManage={props.canReadAdmin}
          onClose={() => setDevReqOpen(false)}
          onSaved={(m) => { setDevReqOpen(false); setShellMsg(m) }} />
      ) : null}
      <StatusBar cells={[
        <span key="pending" className={counts.inbox > 0 ? 'st warn' : undefined}
          style={{ cursor: 'pointer' }} onClick={() => router.push('/common/approval')}>
          {t('shell.pending', '승인 대기')} {counts.inbox}
        </span>,
        ...(shellMsg ? [<span key="msg" style={{ color: 'var(--run)' }}>{shellMsg}</span>] : []),
        <span key="ssr">SSR · {pathname}</span>,
      ]} />
    </div>
  )
}

/** U14 — 미니 달력: 이번 달 마일스톤 납기 마킹 (OVERDUE 적·DUE_SOON 황·기타 회색), 클릭=마일스톤. */
function MiniCalendar({ dates, onOpen }: { dates: { date: string; delayStatus: string }[]; onOpen: () => void }) {
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null)
  useEffect(() => {
    const now = new Date()
    setYm({ y: now.getFullYear(), m: now.getMonth() })
  }, [])
  if (!ym) return null
  const first = new Date(ym.y, ym.m, 1)
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
  const lead = first.getDay()
  const prefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-`
  const byDay: Record<number, string> = {}
  for (const d of dates) {
    if (!d.date.startsWith(prefix)) continue
    const day = Number(d.date.slice(8, 10))
    const cur = byDay[day]
    // 심각도 우선: OVERDUE > DUE_SOON > 기타
    if (cur === 'OVERDUE') continue
    if (d.delayStatus === 'OVERDUE' || cur !== 'DUE_SOON' || d.delayStatus === 'DUE_SOON') byDay[day] = d.delayStatus
  }
  const dotColor = (s: string) => s === 'OVERDUE' ? 'var(--err)' : s === 'DUE_SOON' ? 'var(--warn, #B4820B)' : 'var(--txt-mute)'
  const today = new Date()
  const isThisMonth = today.getFullYear() === ym.y && today.getMonth() === ym.m
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  return (
    <div data-mini-calendar style={{ marginTop: 2, cursor: 'pointer' }} onClick={onOpen} title="마일스톤 열기">
      <div style={{ fontSize: 9, color: 'var(--txt-mute)', marginBottom: 1 }}>{ym.y}.{String(ym.m + 1).padStart(2, '0')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, fontSize: 8.5, textAlign: 'center' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => <div key={d} style={{ color: 'var(--txt-mute)' }}>{d}</div>)}
        {cells.map((day, i) => day == null ? <div key={`e${i}`} /> : (
          <div key={day} style={{
            position: 'relative', padding: '1px 0', borderRadius: 2,
            background: isThisMonth && day === today.getDate() ? 'var(--sel-yellow, #FFF3C2)' : undefined,
            fontWeight: byDay[day] ? 700 : 400,
          }}>
            {day}
            {byDay[day] ? <span style={{ position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 2, background: dotColor(byDay[day]) }} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
