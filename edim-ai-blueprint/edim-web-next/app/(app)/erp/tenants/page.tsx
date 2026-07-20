import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AccessDenied } from '@/components/AccessDenied'
import { hasLevel } from '@/lib/auth'
import { TenantPanel, type TenantRow } from './TenantPanel'

export const dynamic = 'force-dynamic'

/** 1.3 — 고객사 관리 (플랫폼 운영 전용). 고객사 ADMIN 은 403 안내. */
export default async function TenantsPage() {
  if (!(await hasLevel('ADMIN'))) return <AccessDenied minLevel="ADMIN" />
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: TenantRow[] = []
  let err: string | null = null
  let platformCode = ''
  try {
    const [list, me] = await Promise.all([
      apiServer<TenantRow[]>('/platform/tenants'),
      apiServer<{ tenantCode: string }>('/auth/me').catch(() => ({ tenantCode: '' })),
    ])
    rows = list
    platformCode = me.tenantCode
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('tenant.title', '고객사 관리 (플랫폼)')} count={err ? undefined : rows.length}
        countLabel={t('tenant.unit', '고객사')} source="/platform/tenants" />
      {err ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }} data-tenant-denied>
          {err}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex' }}>
          <TenantPanel rows={rows} platformCode={platformCode} />
        </div>
      )}
    </div>
  )
}
