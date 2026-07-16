import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { StockGrid, type StockRow } from './StockGrid'
import { InboundForm } from './InboundForm'
import { StockPanels, type AtpRow, type MovementRow, type ReservationRow } from './StockPanels'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: StockRow[] = []
  let atp: AtpRow[] = []
  let reservations: ReservationRow[] = []
  let movements: MovementRow[] = []
  let err: string | null = null
  try {
    ;[rows, atp, reservations, movements] = await Promise.all([
      apiServer<StockRow[]>('/erp/stock'),
      apiServer<AtpRow[]>('/erp/stock/atp').catch(() => []),
      apiServer<ReservationRow[]>('/erp/stock/reservations?status=ACTIVE').catch(() => []),
      apiServer<MovementRow[]>('/erp/stock/trace').catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0)

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{t('inv.pageTitle', '재고 관리')} (D-2)</span>
        {!err ? <span className="chip info">{rows.length}종</span> : null}
        {!err ? <span className="chip ok">{t('inv.totalValue', '총 평가액')} ₩{Math.round(totalValue).toLocaleString()}</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /erp/stock · atp · reservations · trace</span>
      </div>
      <InboundForm />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ flex: 1.2, minHeight: 0 }}><StockGrid rows={rows} /></div>
          <StockPanels atp={atp} reservations={reservations} movements={movements} />
        </div>
      )}
    </div>
  )
}
