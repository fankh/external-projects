/** 셸 상태 — MDI 탭 · 활성 모듈 · 상태바 메시지. */
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'

export type ModuleId = 'cpq' | 'plm' | 'code' | 'erp'

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

export function ShellProvider(props: { initialModule: ModuleId; children: ReactNode }) {
  const [module, setModuleState] = useState<ModuleId>(props.initialModule)
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
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

  const value = useMemo(() => ({
    module, setModule, tabs, activeTabId, openTab, closeTab, activateTab,
    statusMsg, setStatusMsg,
  }), [module, setModule, tabs, activeTabId, openTab, closeTab, activateTab, statusMsg])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
