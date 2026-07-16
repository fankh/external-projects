import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { AccessDenied } from '@/components/AccessDenied'
import { hasLevel } from '@/lib/auth'
import { AuditPanel } from './AuditGrid'
import type { AuditData } from './actions'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  if (!(await hasLevel('SETUP'))) return <AccessDenied minLevel="SETUP" />
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let data: AuditData | null = null
  let err: string | null = null
  try {
    data = await apiServer<AuditData>('/audit?limit=500')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{t('menu.erp-audit', '감사 조회 (M-14-6A)')}</span>
        {data ? <span className="chip info">{data.rows.length}건</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /audit (ADMIN)</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err || !data ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        ) : (
          <AuditPanel initial={data} />
        )}
      </div>
    </div>
  )
}
