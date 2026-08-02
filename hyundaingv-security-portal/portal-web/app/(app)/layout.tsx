import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/chrome/AppShell'
import { channelSummary } from '@/lib/integrations/registry'
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
    todos: s.todos.filter((t) => t.owner === session.name && !t.done).length,
    approvals: s.approvals.filter((a) => a.approver === session.name && a.status === '대기').length,
  }
  const channels = channelSummary()

  return (
    <AppShell
      role={session.role}
      badges={badges}
      channels={channels}
      lastBatch={s.batchRuns[0] ? { job: s.batchRuns[0].job, at: s.batchRuns[0].ranAt } : undefined}
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
