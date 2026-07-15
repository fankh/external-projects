'use client'
/** 앱 셸 — 타이틀바(모듈)·메뉴바·MDI 탭(최근 화면)·모듈 트리·상태바.
 *  MDI 다중탭 → URL 라우팅 대체: 방문 화면을 탭 스트립으로 유지(localStorage), 클릭=이동.
 *  레거시 SPA Shell.tsx 의 크롬 구조 포팅. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { MenuBar, MdiTabs, StatusBar, TitleBar, type MdiTab, type MenuItem } from './chrome'
import { LnavTree, type TreeNode } from './LnavTree'
import { HREF_INFO, MENU_TREE, moduleOfPath, type ModuleKey, type NavNode } from './menus'

const TABS_KEY = 'edim-next-tabs'
const MAX_TABS = 12

function loadTabs(): MdiTab[] {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]') as MdiTab[] } catch { return [] }
}

export function AppChrome(props: {
  user: string
  canReadAdmin: boolean
  bell?: ReactNode
  right?: ReactNode          // 로그아웃 폼 (서버 액션)
  children: ReactNode
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const module = moduleOfPath(pathname)

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

  // ── 모듈 트리 — 권한 숨김 + 라벨 번역 ──
  const trNodes = useMemo(() => {
    const walk = (ns: NavNode[]): TreeNode[] => ns
      .filter((n) => props.canReadAdmin || n.minLevel !== 'SETUP')
      .map((n) => ({
        id: n.id,
        href: n.href,
        label: t(`menu.${n.id}`, n.label),
        children: n.children ? walk(n.children) : undefined,
      }))
    return walk(MENU_TREE[module].nodes)
  }, [module, t, props.canReadAdmin])
  const selectedId = HREF_INFO[pathname]?.id ?? null

  // ── 메뉴바 드롭다운 ──
  const stepTab = useCallback((dir: 1 | -1) => {
    if (tabs.length === 0) return
    const idx = Math.max(0, tabs.findIndex((x) => x.id === pathname))
    router.push(tabs[(idx + dir + tabs.length) % tabs.length].id)
  }, [tabs, pathname, router])
  const menus: Record<string, MenuItem[]> = {
    '파일': [
      { label: t('common.print', '인쇄'), onClick: () => window.print() },
      { sep: true, label: '' },
      { label: t('shell.logout', '로그아웃'), onClick: () => {
        document.querySelector<HTMLFormElement>('form[data-logout]')?.requestSubmit()
      } },
    ],
    '도구': [
      { label: 'Macro Studio (S-2-2)', onClick: () => router.push('/toolbox/macros') },
      { label: 'UI Designer (S-2-1)', onClick: () => router.push('/toolbox/ui-designer') },
      { label: '데이터 Table (M-3-7)', onClick: () => router.push('/code/datatable') },
      { sep: true, label: '' },
      { label: '문서 포털 (docs)', onClick: () => window.open('/docs/', '_blank') },
    ],
    '창': [
      { label: '다음 탭', hint: 'Alt+→', onClick: () => stepTab(1), disabled: tabs.length === 0 },
      { label: '이전 탭', hint: 'Alt+←', onClick: () => stepTab(-1), disabled: tabs.length === 0 },
      { label: '탭 닫기', disabled: !HREF_INFO[pathname],
        onClick: () => closeTab(pathname) },
      { label: '모든 탭 닫기', disabled: tabs.length === 0,
        onClick: () => { setTabs([]); try { localStorage.setItem(TABS_KEY, '[]') } catch { /* quota */ } } },
      { sep: true, label: '' },
      ...trTabs.slice(0, 12).map((tab) => ({
        label: `${tab.id === pathname ? '● ' : ''}${tab.code} ${tab.title}`,
        onClick: () => router.push(tab.id),
      })),
    ],
    '도움말': [
      { label: '시연 시나리오 (PDF)', onClick: () => window.open('/docs/files/pdf/EDIM_시연시나리오.pdf', '_blank') },
      { sep: true, label: '' },
      { label: 'EDIM Tool System — NOVA Solution', disabled: true },
    ],
  }

  const moduleTitle = module === 'common'
    ? t('menu.moduleCommon', MENU_TREE[module].title) : MENU_TREE[module].title

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar user={props.user} bell={props.bell} right={props.right}
        activeModule={module} onModule={(m: ModuleKey) => router.push(`/${m}`)} />
      <MenuBar menus={menus} />
      <MdiTabs tabs={trTabs} activeId={pathname}
        onActivate={(id) => router.push(id)} onClose={closeTab} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <LnavTree title={moduleTitle} nodes={trNodes} selectedId={selectedId}
          onSelect={(n) => { if (n.href) router.push(n.href) }} width={220} />
        <main className="workarea" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {props.children}
        </main>
      </div>
      <StatusBar cells={[<span key="ssr">SSR · {pathname}</span>]} />
    </div>
  )
}
