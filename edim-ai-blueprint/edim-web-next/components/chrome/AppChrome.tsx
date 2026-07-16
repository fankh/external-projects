'use client'
/** 앱 셸 — 타이틀바(모듈)·메뉴바·MDI 탭(최근 화면)·모듈 트리·상태바.
 *  MDI 다중탭 → URL 라우팅 대체: 방문 화면을 탭 스트립으로 유지(localStorage), 클릭=이동.
 *  레거시 SPA Shell.tsx 의 크롬 구조 포팅. */
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { MenuBar, MdiTabs, StatusBar, TitleBar, type MdiTab, type MenuItem } from './chrome'
import { GlobalSearch } from './GlobalSearch'
import { LnavTree, type TreeNode } from './LnavTree'
import { HREF_INFO, MENU_TREE, moduleOfPath, type ModuleKey, type NavNode } from './menus'
import { changePassword, getFavorites, saveFavorites, shellCounts, type FavItem } from './shellActions'

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

  // ── 셸 크롬 카운트 (P2) — 승인 대기 = 실 inbox, PL 지연 = 부서 이벤트 delayed 합 ──
  //    초기 + 라우팅 변경 + 60초 폴링 + edim-inbox-refresh(승인 결정) 즉시 갱신
  const [counts, setCounts] = useState({ inbox: 0, delayed: 0 })
  useEffect(() => {
    let alive = true
    const load = () => void shellCounts().then((c) => { if (alive) setCounts(c) })
    load()
    const timer = setInterval(load, 60_000)
    window.addEventListener('edim-inbox-refresh', load)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('edim-inbox-refresh', load) }
  }, [pathname])

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
      { label: t('shell.demoScenario', '시연 시나리오 (PDF)'), onClick: () => window.open('/docs/files/pdf/EDIM_시연시나리오.pdf', '_blank') },
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
      <MenuBar menus={menus} right={
        <>
          {/* D8 — 화면 즐겨찾기: ★ 토글 + 칩 (최대 8) */}
          <span className="b ic" data-fav-toggle
            title={curInfo ? (isFav ? t('shell.favRemove', '즐겨찾기 해제') : t('shell.favAdd', '현재 화면 즐겨찾기 추가')) : t('shell.favNoScreen', '즐겨찾기 — 화면을 먼저 여십시오')}
            style={{ color: isFav ? '#E8B84B' : undefined, cursor: curInfo ? 'pointer' : 'default', marginLeft: 8 }}
            onClick={toggleFav}>{isFav ? '★' : '☆'}</span>
          {favs.slice(0, 8).map((f) => (
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
        <LnavTree title={moduleTitle} nodes={trNodes} selectedId={selectedId}
          onSelect={(n) => { if (n.href) router.push(n.href) }} width={220}
          footer={
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <div className="hd">{t('shell.todo', 'To-Do')}</div>
              <div style={{ padding: '6px 8px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => router.push('/common/approval')} title={t('shell.todoApprovalHint', '승인함 열기')}>
                  {t('shell.todoApproval', '승인 확인')}<span style={{ flex: 1 }} /><span className={counts.inbox > 0 ? 'st warn' : 'st'}>{counts.inbox}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => router.push('/erp/dashboard')} title={t('shell.todoPlHint', '대시보드 열기')}>
                  {t('shell.todoPl', 'PL 지연')}<span style={{ flex: 1 }} /><span className={counts.delayed > 0 ? 'st err' : 'st'}>{counts.delayed}</span>
                </div>
              </div>
            </div>
          } />
        <main className="workarea" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {props.children}
        </main>
      </div>
      <StatusBar cells={[
        <span key="pending" className={counts.inbox > 0 ? 'st warn' : undefined}
          style={{ cursor: 'pointer' }} onClick={() => router.push('/common/approval')}>
          {t('shell.pending', '승인 대기')} {counts.inbox}
        </span>,
        <span key="ssr">SSR · {pathname}</span>,
      ]} />
    </div>
  )
}
