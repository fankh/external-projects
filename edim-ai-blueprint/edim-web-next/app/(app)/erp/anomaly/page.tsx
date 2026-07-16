import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AnomalyGrid, type AnomalyRow } from './AnomalyGrid'

export const dynamic = 'force-dynamic'

export default async function AnomalyPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: AnomalyRow[] = []
  let err: string | null = null
  try {
    // 응답 = { rows, open, openHigh } (배열 아님 — 미그레이션 시 오인해 SSR 500 이던 화면)
    const d = await apiServer<{ rows: AnomalyRow[] }>('/anomalies')
    rows = d.rows ?? []
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.erp-anomaly', '이상 이벤트 (M-14-4A)')} count={err ? undefined : rows.length} source="/anomalies" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <AnomalyGrid rows={rows} />}
      </div>
    </div>
  )
}
