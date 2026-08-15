import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/chrome/AppShell'
import { canDecideApproval } from '@/lib/approval'
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
  // 신청·결재 뱃지는 '내 결재 차례'(지금 이 사람이 결재할 수 있는 대기 건, 본인 상신분 제외) — 대시보드 myQueue 와 동일 판정.
  // 그동안 전사 대기 결재 총계를 전 역할에 노출해, 결재 권한이 없는 사용자에게도 큰 숫자가 떠 실제 내 조치량과 어긋났다.
  const badges = {
    approvals: s.approvals.filter((a) => a.requester !== session.name && canDecideApproval(session.role, a)).length,
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
