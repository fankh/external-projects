import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PriceGrid, type PriceRow } from './PriceGrid'

export const dynamic = 'force-dynamic'

export default async function PricesPage() {
  const locale = await getLocale()
  const t = (k: string, ko: string) => translate(bundleFor(locale), k, ko)
  let rows: PriceRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PriceRow[]>('/prices')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('price.ledgerTitle', '단가 대장')} (M-12-5)`} count={err ? undefined : rows.length} source="/prices" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <PriceGrid rows={rows} />}
      </div>
    </div>
  )
}
