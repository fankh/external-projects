import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/chrome/AppShell'
import { NAV } from '@/components/chrome/menus'
import { appendAudit } from '@/lib/audit'
import { canDecideApproval } from '@/lib/approval'
import { canViewMenu } from '@/lib/perm'
import { getSession, SESSION_COOKIE } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ROLE_LABEL, isUntriagedDiscovery } from '@/lib/types'

async function logout() {
  'use server'
  // 접근 기록의 짝 — 로그인만 남기고 로그아웃을 안 남기면 '언제까지 접속해 있었나'가 증적에서 빠진다.
  //  쿠키를 지우기 전에 누구의 세션이었는지 확인해 남긴다(지운 뒤에는 알 수 없다).
  const who = await getSession()
  if (who) appendAudit({ actor: who.name, action: `로그아웃 — ${ROLE_LABEL[who.role]}`, target: who.login })
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const s = getStore()
  // 신청·결재 뱃지는 '내 결재 차례'(지금 이 사람이 결재할 수 있는 대기 건) — 대시보드 myQueue 와 같은 한 판정을 쓴다.
  // 직무 분리(본인 폼 상신 제외)는 판정 안에 있다 — 보는 사람 이름을 넘기는 것으로 충분하다.
  // 그동안 전사 대기 결재 총계를 전 역할에 노출해, 결재 권한이 없는 사용자에게도 큰 숫자가 떠 실제 내 조치량과 어긋났다.
  const badges = {
    approvals: s.approvals.filter((a) => canDecideApproval(session.role, a, session.name)).length,
    unregistered: s.discovered.filter(isUntriagedDiscovery).length,
  }

  return (
    <AppShell
      role={session.role}
      visibleHrefs={NAV.flatMap((g) => g.items).filter((it) => it.roles.includes(session.role) && canViewMenu(it.href, session.role)).map((it) => it.href)}
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
