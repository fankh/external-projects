/** 셸 상태 — MDI 탭 · 활성 모듈 · 상태바 메시지 · URL 이력 동기(브라우저 뒤로/앞으로). */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type ModuleId = 'cpq' | 'plm' | 'code' | 'erp' | 'toolbox' | 'common'

export interface OpenTab {
  id: string          // 화면 인스턴스 id (screenId 또는 screenId:seq)
  screenId: string    // 'cpq-selection' …
  code: string        // C-1, S-4-1-1 …
  title: string
  params?: Record<string, unknown>
}

interface ShellState {
  module: ModuleId
  setModule: (m: ModuleId) => void
  tabs: OpenTab[]
  activeTabId: string | null
  openTab: (tab: Omit<OpenTab, 'id'> & { id?: string }) => void
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  statusMsg: ReactNode | null
  setStatusMsg: (m: ReactNode | null) => void
}

const Ctx = createContext<ShellState | null>(null)

export function useShell(): ShellState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useShell outside ShellProvider')
  return v
}

let seq = 0

const MODULE_IDS: ModuleId[] = ['cpq', 'plm', 'code', 'erp', 'toolbox', 'common']

/** screenId → 소속 모듈 (좌측 트리 자동 전환용). 상세 탭(-detail 등)은 현재 모듈 유지. */
function moduleOfScreen(screenId: string): ModuleId | null {
  if (screenId.endsWith('-detail') || screenId === 'cad-viewer') return null
  const prefix = screenId.split('-')[0]
  const map: Record<string, ModuleId> = {
    cpq: 'cpq', plm: 'plm', code: 'code', erp: 'erp', tbx: 'toolbox', com: 'common',
  }
  return map[prefix] ?? null
}

/** URL 표현 — 운영(nginx SPA fallback): /{module}#{tabId} ·
 *  dev/preview(/edim-static/ 직접 서빙): 경로 유지 + #{module}/{tabId} (reload 404 방지) */
function urlFor(m: ModuleId, tabId: string | null): string {
  if (window.location.pathname.startsWith('/edim-static')) {
    return `${window.location.pathname}#/${m}${tabId ? `/${encodeURIComponent(tabId)}` : ''}`
  }
  return `/${m}${tabId ? `#${encodeURIComponent(tabId)}` : ''}`
}

function parseUrl(): { m: ModuleId | null; tabId: string | null } {
  const path = window.location.pathname
  const hash = window.location.hash.slice(1)
  if (path.startsWith('/edim-static')) {
    const seg = hash.replace(/^\//, '')
    const slash = seg.indexOf('/')
    const m = (slash < 0 ? seg : seg.slice(0, slash)) as ModuleId
    const tabId = slash < 0 ? null : decodeURIComponent(seg.slice(slash + 1))
    return { m: MODULE_IDS.includes(m) ? m : null, tabId }
  }
  const m = path.replace(/^\//, '') as ModuleId
  return {
    m: MODULE_IDS.includes(m) ? m : null,
    tabId: hash ? decodeURIComponent(hash) : null,
  }
}

/** 현재 상태를 URL 에 반영 — 브라우저 뒤로/앞으로가 탭 이력을 따라간다. */
function syncUrl(m: ModuleId, tabId: string | null): void {
  const url = urlFor(m, tabId)
  if (window.location.pathname + window.location.hash !== url) {
    window.history.pushState(null, '', url)
  }
}

// ── MDI 탭 영속 (localStorage) — 새로고침·재접속 후 복원 ──
// Run 탭(cpq-run:*)은 제외: 복원 시 파이프라인이 재실행되므로 휘발성으로 둔다.
const TABS_KEY = 'edim-open-tabs'

function persistable(tabs: OpenTab[]): OpenTab[] {
  return tabs.filter((t) => t.screenId !== 'cpq-run')
}

function loadTabs(): { tabs: OpenTab[]; activeTabId: string | null } {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return { tabs: [], activeTabId: null }
    const saved = JSON.parse(raw) as { tabs?: OpenTab[]; activeTabId?: string | null }
    const tabs = persistable((saved.tabs ?? []).filter(
      (t) => t && typeof t.id === 'string' && typeof t.screenId === 'string'))
    const activeTabId = tabs.some((t) => t.id === saved.activeTabId)
      ? saved.activeTabId ?? null
      : (tabs[tabs.length - 1]?.id ?? null)
    return { tabs, activeTabId }
  } catch {
    return { tabs: [], activeTabId: null }
  }
}

function saveTabs(tabs: OpenTab[], activeTabId: string | null): void {
  try {
    const keep = persistable(tabs)
    localStorage.setItem(TABS_KEY, JSON.stringify({
      tabs: keep,
      activeTabId: keep.some((t) => t.id === activeTabId) ? activeTabId : null,
    }))
  } catch { /* quota 등 — 영속 실패는 무시 */ }
}

export function ShellProvider(props: { initialModule: ModuleId; children: ReactNode }) {
  const [module, setModuleState] = useState<ModuleId>(props.initialModule)
  const [tabs, setTabs] = useState<OpenTab[]>(() => loadTabs().tabs)
  const [activeTabId, setActiveTabId] = useState<string | null>(() => loadTabs().activeTabId)
  const [statusMsg, setStatusMsg] = useState<ReactNode | null>(null)

  // 콜백에서 최신값 참조 (의존성 없는 안정 콜백 유지)
  const moduleRef = useRef(module)
  moduleRef.current = module
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const setModule = useCallback((m: ModuleId) => {
    setModuleState(m)
    // 배포 경로 /cpq /plm 과 동기화 (router 없이 pathname+hash 만 사용)
    syncUrl(m, null)
  }, [])

  const openTab = useCallback((tab: Omit<OpenTab, 'id'> & { id?: string }) => {
    // 동일 화면 단일 인스턴스 (params 로 새 인스턴스 강제 시 id 지정)
    const id = tab.id ?? tab.screenId ?? `t${seq++}`
    const m = moduleOfScreen(tab.screenId) ?? moduleRef.current
    if (m !== moduleRef.current) setModuleState(m)
    setActiveTabId(id)
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { ...tab, id }]))
    syncUrl(m, id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      setActiveTabId((cur) => {
        if (cur !== id) return cur
        const neighbor = next[Math.max(0, idx - 1)]
        return neighbor ? neighbor.id : null
      })
      return next
    })
  }, [])

  const activateTab = useCallback((id: string) => {
    setActiveTabId(id)
    const tb = tabsRef.current.find((t) => t.id === id)
    const m = (tb ? moduleOfScreen(tb.screenId) : null) ?? moduleRef.current
    if (m !== moduleRef.current) setModuleState(m)
    syncUrl(m, id)
  }, [])

  // ── 브라우저 뒤로/앞으로 — URL 을 상태로 역반영 (pushState 없이) ──
  useEffect(() => {
    const onPop = () => {
      const { m, tabId } = parseUrl()
      if (m) setModuleState(m)
      if (tabId && tabsRef.current.some((t) => t.id === tabId)) setActiveTabId(tabId)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 최초 진입 — URL 의 탭이 복원 목록에 있으면 활성화, 없으면 현재 상태를 URL 에 반영
  useEffect(() => {
    const { tabId } = parseUrl()
    if (tabId && tabsRef.current.some((t) => t.id === tabId)) {
      setActiveTabId(tabId)
    } else {
      const cur = tabsRef.current.find((t) => t.id === activeTabId)
      window.history.replaceState(null, '', urlFor(moduleRef.current, cur?.id ?? null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 탭 변경 시마다 저장 — 새로고침 후 loadTabs() 로 복원
  useEffect(() => {
    saveTabs(tabs, activeTabId)
  }, [tabs, activeTabId])

  const value = useMemo(() => ({
    module, setModule, tabs, activeTabId, openTab, closeTab, activateTab,
    statusMsg, setStatusMsg,
  }), [module, setModule, tabs, activeTabId, openTab, closeTab, activateTab, statusMsg])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
