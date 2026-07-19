import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PcrPanel, type PcrRow } from './PcrPanel'

interface Report { id: string; name: string; category: string; kind: string; count: number | null; screen: string; desc: string }

export const dynamic = 'force-dynamic'

export default async function ReportCenterPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: Report[] = []
  let pcr: PcrRow[] = []
  let err: string | null = null
  try {
    ;[rows, pcr] = await Promise.all([
      apiServer<Report[]>('/reports/catalog'),
      apiServer<PcrRow[]>('/cost/pcr').catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Report Center (RPT)" count={err ? undefined : rows.length} countLabel={t('rpt.kindsUnit', '종')} source="/reports/catalog" />
      <div style={{ flex: 1, minHeight: 0, padding: 10, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        ) : (
          <>
          <PcrPanel rows={pcr} />
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)' }}>
            {t('rpt.catalog', '리포트 카탈로그')} — {rows.length}{t('rpt.kindsUnit', '종')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} className="gb" style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="chip info">{r.category}</span>
                  <span className="chip ok">{r.kind}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{r.count ?? '—'}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--title-navy)' }}>{r.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3, lineHeight: 1.6 }}>{r.desc}</div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  )
}
