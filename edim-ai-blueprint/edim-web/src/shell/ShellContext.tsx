/** 셸 상태 — MDI 탭 · 활성 모듈 · 상태바 메시지. */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
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

  const setModule = useCallback((m: ModuleId) => {
    setModuleState(m)
    // 배포 경로 /cpq /plm 과 동기화 (router 없이 pathname 만 사용)
    window.history.pushState(null, '', `/${m}`)
  }, [])

  const openTab = useCallback((tab: Omit<OpenTab, 'id'> & { id?: string }) => {
    setTabs((prev) => {
      // 동일 화면 단일 인스턴스 (params 로 새 인스턴스 강제 시 id 지정)
      const existing = prev.find((t) => t.id === (tab.id ?? tab.screenId))
      if (existing) {
        setActiveTabId(existing.id)
        return prev
      }
      const id = tab.id ?? tab.screenId ?? `t${seq++}`
      setActiveTabId(id)
      return [...prev, { ...tab, id }]
    })
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

  const activateTab = useCallback((id: string) => setActiveTabId(id), [])

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
