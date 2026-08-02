'use client'
/** 앱 셸 — itam-web AppShell 패턴 계승: 타이틀바 · 도메인 메뉴바(LV1) · MDI 탭(최근 화면) ·
 *  좌측 내비(LV2) · 상태바. 방문 화면을 탭 스트립으로 유지(localStorage), 클릭=이동.
 *  디자인은 뉴트럴 엔터프라이즈 — 그레이 기조에 도메인 액센트 색(--dm)만 차등. */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { Role } from '@/lib/types'
import { NAV, TITLE_BY_HREF } from './menus'

const TABS_KEY = 'ngv-portal-tabs'
const MAX_TABS = 10

interface Tab { href: string; title: string }

function loadTabs(): Tab[] {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]') as Tab[] } catch { return [] }
}
function saveTabs(tabs: Tab[]) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)) } catch { /* quota */ }
}

const hueStyle = (hue: string) => ({ '--dm': hue }) as CSSProperties

export function AppShell(props: {
  role: Role
  badges: { todos: number; approvals: number }
  channels: { on: number; total: number }
  lastBatch?: { job: string; at: string }
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
  const badgeOf = (badge?: 'todos' | 'approvals') => (badge ? props.badges[badge] : 0)

  // MDI 탭 — 방문 시 upsert, 새로고침 간 유지
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
        <div className="brand">
          <div className="wordmark">GOVERNANCE PORTAL</div>
          <div className="sub">Enterprise IT · Security</div>
        </div>
        <div className="sp" />
        <input
          className="search"
          placeholder="SR번호 · 제목 검색"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const q = (e.target as HTMLInputElement).value.trim()
              router.push(q ? `/sr/requests?q=${encodeURIComponent(q)}` : '/sr/requests')
            }
          }}
        />
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
            <button key={g.label} className={g === activeGroup ? 'on' : ''} style={hueStyle(g.hue)}
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
            style={hueStyle(TITLE_BY_HREF[t.href]?.hue ?? '#52525b')}
            onClick={() => router.push(t.href)}>
            {t.title}
            <span className="x" role="button" aria-label={`${t.title} 탭 닫기`}
              onClick={(e) => { e.stopPropagation(); closeTab(t.href) }}>×</span>
          </span>
        ))}
      </div>

      <div className="workrow">
        <aside className="modnav" style={hueStyle(activeGroup.hue)}>
          <div className="hd kicker dm">{activeGroup.label}</div>
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
              연동 채널 {props.channels.on}/{props.channels.total} {props.channels.on === props.channels.total ? '정상' : '일부 중지'}
            </span>
            <span>{props.lastBatch ? `마지막 배치 ${props.lastBatch.at} (${props.lastBatch.job})` : '배치 이력 없음'}</span>
            <span className="grow" />
            <span>ENTERPRISE IT · SECURITY GOVERNANCE PORTAL · v0.1</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
