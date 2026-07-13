import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { OrderGrid, type OrderRow } from './OrderGrid'

interface Orders { orders: OrderRow[]; orderRate?: number; totalContract?: number }

export const dynamic = 'force-dynamic'

export default async function SalesOrderPage() {
  let data: Orders | null = null
  let err: string | null = null
  try {
    data = await apiServer<Orders>('/cost/orders')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const rows = data?.orders ?? []
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="수주 관리 (D-1)" count={err ? undefined : rows.length} source="/cost/orders" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <OrderGrid rows={rows} />}
      </div>
    </div>
  )
}
