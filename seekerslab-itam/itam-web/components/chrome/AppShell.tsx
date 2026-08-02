'use client'
/** 앱 셸 — edim-web-next AppChrome 계승: 타이틀바 · 모듈 메뉴바(LV1) · MDI 탭(최근 화면) ·
 *  모듈 좌측 내비(LV2) · 상태바. 방문 화면을 탭 스트립으로 유지(localStorage), 클릭=이동. */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import type { Role } from '@/lib/types'
import { GlobalSearch } from './GlobalSearch'
import { NAV, TITLE_BY_HREF } from './menus'

const TABS_KEY = 'itam-tabs'
const MAX_TABS = 10

interface Tab { href: string; title: string }

function loadTabs(): Tab[] {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]') as Tab[] } catch { return [] }
}
function saveTabs(tabs: Tab[]) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)) } catch { /* quota */ }
}

export function AppShell(props: {
  role: Role
  badges: { approvals: number; unregistered: number }
  channels: { on: number; total: number }
  /** 상태바의 마지막 스캔 — 실제 스캔 이력에서 온다 (하드코딩 금지) */
  lastScan?: { at: string; by: string }
  userName: string
  dept: string
  roleLabel: string
  logout: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const groups = NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(props.role)) }))
    .filter((g) => g.items.length > 0)
  const activeGroup = groups.find((g) => g.items.some((i) => pathname.startsWith(i.href))) ?? groups[0]
  const badgeOf = (badge?: 'approvals' | 'unregistered') => (badge ? props.badges[badge] : 0)

  // MDI 탭 — 방문 시 upsert, 새로고침 간 유지 (edim MdiTabs 패턴)
  const [tabs, setTabs] = useState<Tab[]>([])
  useEffect(() => { setTabs(loadTabs()) }, [])
  useEffect(() => {
    const info = TITLE_BY_HREF[pathname]
    if (!info) return
    setTabs((cur) => {
      if (cur.some((t) => t.href === pathname)) return cur
      const next = [...cur, { href: pathname, title: info.title }].slice(-MAX_TABS)
      saveTabs(next)
      return next
    })
  }, [pathname])
  const closeTab = (href: string) => {
    setTabs((cur) => {
      const next = cur.filter((t) => t.href !== href)
      saveTabs(next)
      if (href === pathname) router.push(next.length ? next[next.length - 1].href : '/dashboard')
      return next
    })
  }

  return (
    <div className="shell">
      <header className="titlebar">
        <div>
          <div className="wordmark">SEEKERSLAB</div>
          <div className="sub">AI Asset Management</div>
        </div>
        <div className="sp" />
        <GlobalSearch />
        <div className="userchip">
          <span className="avatar">{props.userName.slice(0, 1)}</span>
          <span>
            <div className="nm">{props.userName}</div>
            <div className="rl">{props.dept} · {props.roleLabel}</div>
          </span>
        </div>
        {props.logout}
      </header>

      <nav className="menubar">
        {groups.map((g) => {
          const n = g.items.reduce((s, i) => s + badgeOf(i.badge), 0)
          return (
            <button key={g.label} className={g === activeGroup ? 'on' : ''}
              onClick={() => router.push(g.items[0].href)}>
              {g.label}
              {n > 0 && <span className="bdg">{n}</span>}
            </button>
          )
        })}
      </nav>

      <div className="mdibar">
        {tabs.map((t) => (
          <span key={t.href} role="tab" className={`tab ${t.href === pathname ? 'on' : ''}`}
            onClick={() => router.push(t.href)}>
            {t.title}
            <span className="x" role="button" aria-label={`${t.title} 탭 닫기`}
              onClick={(e) => { e.stopPropagation(); closeTab(t.href) }}>×</span>
          </span>
        ))}
      </div>

      <div className="workrow">
        <aside className="modnav">
          <div className="hd kicker mute">{activeGroup.label}</div>
          {activeGroup.items.map((i) => {
            const n = badgeOf(i.badge)
            return (
              <Link key={i.href} href={i.href} className={pathname.startsWith(i.href) ? 'on' : ''}>
                <span className="ico">{i.ico}</span>
                {i.label}
                {n > 0 && <span className="bdg">{n}</span>}
              </Link>
            )
          })}
        </aside>
        <div className="main">
          <main className="content">
            <div className="content-inner">{props.children}</div>
          </main>
          <footer className="statusbar">
            <span>
              <span className="dot" style={props.channels.on < props.channels.total ? { background: 'var(--warn)' } : undefined} />
              수집·연동 계층 {props.channels.on === props.channels.total ? '정상' : '일부 중지'} — 탐지 채널 {props.channels.on}/{props.channels.total}
            </span>
            <span>{props.lastScan ? `마지막 스캔 ${props.lastScan.at} (${props.lastScan.by})` : '스캔 이력 없음'}</span>
            <span className="grow" />
            <span>SEEKERSLAB — AI ASSET MANAGEMENT PLATFORM · v1.0</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
