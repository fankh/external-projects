import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/chrome/AppShell'
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
    <AppShell
      role={session.role}
      badges={badges}
      channels={{ on: s.scanPolicies.filter((p) => p.enabled).length, total: s.scanPolicies.length }}
      lastScan={s.scanRuns[0] ? { at: s.scanRuns[0].startedAt, by: s.scanRuns[0].by } : undefined}
      userName={session.name}
      dept={session.dept}
      roleLabel={ROLE_LABEL[session.role]}
      logout={
        <form action={logout}>
          <button type="submit" className="btn sm">로그아웃</button>
        </form>
      }
    >
      {children}
    </AppShell>
  )
}
