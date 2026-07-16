import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { TechGrid, type TechDataRow } from './TechGrid'

export const dynamic = 'force-dynamic'

export default async function TechDataPage({ searchParams }: { searchParams: Promise<{ airflow?: string; pressure?: string }> }) {
  const sp = await searchParams
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const airflow = Number(sp.airflow) || 20000
  const pressure = Number(sp.pressure) || 800
  let rows: TechDataRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<TechDataRow[]>(`/tables/tech-data?airflow=${airflow}&pressure=${pressure}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`Tech Data — ${t('techdata.engineTable', '엔진 성능표')} (SVC-05)`} count={err ? undefined : rows.length} source="/tables/tech-data" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
          : <TechGrid rows={rows} airflow={airflow} pressure={pressure} />}
      </div>
    </div>
  )
}
