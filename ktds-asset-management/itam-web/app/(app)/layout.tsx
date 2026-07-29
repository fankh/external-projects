import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/chrome/Sidebar'
import { Topbar } from '@/components/chrome/Topbar'
import { getSession, SESSION_COOKIE } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ROLE_LABEL } from '@/lib/types'

async function logout() {
  'use server'
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const s = getStore()
  const badges = {
    approvals: s.approvals.filter((a) => a.status === '대기').length,
    unregistered: s.discovered.filter((d) => d.state === '미등록' && !d.action).length,
  }

  return (
    <div className="shell">
      <Sidebar role={session.role} badges={badges} />
      <div className="main">
        <Topbar
          userName={session.name}
          dept={session.dept}
          roleLabel={ROLE_LABEL[session.role]}
          right={
            <form action={logout}>
              <button type="submit" className="btn sm">로그아웃</button>
            </form>
          }
        />
        <main className="content">
          <div className="content-inner">{children}</div>
        </main>
        <footer className="statusbar">
          <span><span className="dot" />수집·연동 계층 정상 — 커넥터 6/6</span>
          <span>마지막 스캔 2026-07-28 23:00 (야간 정책)</span>
          <span className="grow" />
          <span>SEEKERSLAB — AI ASSET MANAGEMENT PLATFORM · v1.0</span>
        </footer>
      </div>
    </div>
  )
}
