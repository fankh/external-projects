import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { WarehouseGrid, type WarehouseRow } from './WarehouseGrid'

export const dynamic = 'force-dynamic'

export default async function WarehousesPage() {
  let rows: WarehouseRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<WarehouseRow[]>('/erp/warehouses')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="창고 위치 (M-8-1)" count={err ? undefined : rows.length} source="/erp/warehouses" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <WarehouseGrid rows={rows} />}
      </div>
    </div>
  )
}
