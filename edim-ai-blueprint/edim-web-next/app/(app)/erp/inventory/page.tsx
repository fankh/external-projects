import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { StockGrid, type StockRow } from './StockGrid'
import { InboundForm } from './InboundForm'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  let rows: StockRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<StockRow[]>('/erp/stock')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0)

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>재고 관리 (D-2)</span>
        {!err ? <span className="chip info">{rows.length}종</span> : null}
        {!err ? <span className="chip ok">총 평가액 ₩{Math.round(totalValue).toLocaleString()}</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /erp/stock</span>
      </div>
      <InboundForm />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <StockGrid rows={rows} />}
      </div>
    </div>
  )
}
