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
  /** 이 권한그룹이 열 수 있는 화면 목록 — 라우트 역할 ∩ 매트릭스 조회 (레이아웃에서 주입) */
  visibleHrefs?: string[]
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

  // 사이드바 = 라우트 역할 게이트 ∩ 권한 매트릭스 조회 칸(visibleHrefs, 레이아웃이 서버에서 계산해 넘긴다).
  //  둘이 갈리면 메뉴에는 보이는데 눌러 들어가면 대시보드로 튕기는 링크가 된다.
  //  '감출 목록'이 아니라 '보일 목록'을 넘긴다 — 감출 목록을 넘기면 권한 밖 화면 경로가 클라이언트 페이로드에 실린다.
  const visible = props.visibleHrefs ? new Set(props.visibleHrefs) : null
  const groups = NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(props.role) && (!visible || visible.has(i.href))) }))
    .filter((g) => g.items.length > 0)
  const activeGroup = groups.find((g) => g.items.some((i) => pathname.startsWith(i.href))) ?? groups[0]
  const badgeOf = (badge?: 'approvals' | 'unregistered') => (badge ? props.badges[badge] : 0)

  // MDI 탭 — 방문 시 맨 앞으로 올리고, 새로고침 간 유지 (edim MdiTabs 패턴)
  //  최근 방문이 왼쪽 끝, 오래된 화면이 오른쪽으로 밀린다. 다시 들른 화면도 앞으로 당긴다 —
  //  제자리에 두면 어느 것이 방금 본 화면인지 스트립만 봐서는 알 수 없다.
  //  넘치면 잘리는 쪽은 오른쪽 끝(가장 오래된 화면)이다.
  const [tabs, setTabs] = useState<Tab[]>([])
  useEffect(() => { setTabs(loadTabs()) }, [])
  useEffect(() => {
    const info = TITLE_BY_HREF[pathname]
    if (!info) return
    setTabs((cur) => {
      if (cur[0]?.href === pathname) return cur
      const next = [{ href: pathname, title: info.title }, ...cur.filter((t) => t.href !== pathname)].slice(0, MAX_TABS)
      saveTabs(next)
      return next
    })
  }, [pathname])
  // 사이드바(visible)와 같은 판정 — 매핑이 없는 화면(대시보드 등)은 제한 없음으로 본다.
  const visibleTabs = tabs.filter((t) => !visible || visible.has(t.href))
  const closeTab = (href: string) => {
    setTabs((cur) => {
      const next = cur.filter((t) => t.href !== href)
      saveTabs(next)
      if (href === pathname) router.push(next.length ? next[0].href : '/dashboard')
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
        {/* 탭도 사이드바와 같은 집합만 보여 준다 — 탭은 localStorage 에 남으므로 권한이 회수되거나
            다른 권한그룹으로 로그인하면 열 수 없는 화면이 스트립에 남아, 누르면 대시보드로 튕긴다
            (보이는데 튕기는 링크 방지 · 저장분은 지우지 않아 권한이 복원되면 그대로 돌아온다). */}
        {visibleTabs.map((t) => (
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
