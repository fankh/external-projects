import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from '@/lib/session'
import { SESSION_COOKIE } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { getMe, getPermissions, LEVEL_RANK } from '@/lib/auth'
import { I18nProvider } from '@/components/I18nProvider'
import { PermissionProvider } from '@/components/PermissionProvider'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { notificationDigest } from '@/components/notifications/actions'
import { AppChrome } from '@/components/chrome/AppChrome'
import { DeploySkewWatch } from '@/components/chrome/DeploySkewWatch'
import { buildId } from '@/lib/buildId'
import { getHeadNav, getLeftNav, getProcessTree, getTenantHeadNav, getTenantNav } from '@/components/chrome/shellActions'

async function logout() {
  'use server'
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)

  // P5 — 권한 게이팅 시드 (me + permissions SSR) + 알림 요약 + 테넌트 로고 (U11) + D10 표시 모듈
  const { apiServer } = await import('@/lib/api')
  const [me, perms, digest, branding, menuCfg, leftNav, tenantNav, headNav, tenantHeadNav, cfg, processTree] = await Promise.all([
    getMe(), getPermissions(), notificationDigest(),
    apiServer<{ logoData: string | null }>('/tenant/branding').catch(() => ({ logoData: null })),
    apiServer<{ modules: string[]; restricted: boolean }>('/menu/config').catch(() => ({ modules: [], restricted: false })),
    getLeftNav(), getTenantNav(), getHeadNav(), getTenantHeadNav(),
    apiServer<{ devMode?: boolean }>('/config').catch(() => ({ devMode: false })),
    getProcessTree(),
  ])
  const rank = LEVEL_RANK[me?.userLevel ?? 'GENERAL'] ?? 0
  const canReadAdmin = rank >= (LEVEL_RANK['SETUP'] ?? 99)
  const userLabel = me ? `${me.name} · ${me.userLevel}` : ''

  return (
    <I18nProvider locale={locale} bundle={bundle}>
    <PermissionProvider login={me?.login ?? ''} level={me?.userLevel ?? 'GENERAL'} perms={perms}>
      <AppChrome user={userLabel} canReadAdmin={canReadAdmin} logo={branding.logoData ?? undefined}
        devMode={cfg.devMode === true}
        allowedModules={menuCfg.restricted ? menuCfg.modules : undefined}
        initialProcess={processTree}
        initialLeftNav={leftNav} initialTenantNav={tenantNav}
        initialHeadNav={headNav} initialTenantHeadNav={tenantHeadNav}
        bell={<><NotificationBell initialUnread={digest.unread} /><LocaleSwitcher /></>}
        right={
          <form action={logout} data-logout>
            <button type="submit" className="b" style={{ height: 18, fontSize: 10 }}>{translate(bundle, 'shell.logout', '로그아웃')}</button>
          </form>
        }>
        {children}
        <DeploySkewWatch buildId={buildId()} />
      </AppChrome>
    </PermissionProvider>
    </I18nProvider>
  )
}
