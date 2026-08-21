import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/chrome/AppShell'
import { NAV } from '@/components/chrome/menus'
import { effectiveRoles, groupGrantedMenus } from '@/lib/authz'
import { channelSummary } from '@/lib/integrations/registry'
import { getSession, SESSION_COOKIE } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ROLE_LABEL } from '@/lib/types'
import { PORTAL } from '@/portal.config'

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
  // 런타임 메뉴권한 제한 — 기본 권한은 있으나 제한된 메뉴를 내비에서 숨긴다 (서버 가드는 requireMenu)
  const hiddenHrefs = NAV.flatMap((g) => g.items)
    .filter((i) => i.roles.includes(session.role) && !effectiveRoles(i.href).includes(session.role))
    .map((i) => i.href)
  // 사용자 그룹 열람 위임 — 기본 역할엔 없으나 그룹으로 부여된 운영 화면을 내비에 추가 노출한다
  // (서버 가드는 requireMenu 가 같은 canAccessMenu 술어로 담당 — 표시=강제 정합).
  const grantedHrefs = groupGrantedMenus(session.name)

  return (
    <AppShell
      role={session.role}
      hiddenHrefs={hiddenHrefs}
      grantedHrefs={grantedHrefs}
      badges={badges}
      channels={channels}
      lastBatch={s.batchRuns[0] ? { job: s.batchRuns[0].job, at: s.batchRuns[0].ranAt } : undefined}
      brand={{ name: PORTAL.productName, sub: PORTAL.productSub, version: PORTAL.version, customer: PORTAL.customer, copyright: `© ${new Date().getFullYear()} ${PORTAL.customer}` }}
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
