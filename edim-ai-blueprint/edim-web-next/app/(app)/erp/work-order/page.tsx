import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { WoGrid, type WoRow } from './WoGrid'

export const dynamic = 'force-dynamic'

export default async function WorkOrderPage() {
  let rows: WoRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<WoRow[]>('/erp/work-process')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="작업지시 (D-3)" count={err ? undefined : rows.length} source="/erp/work-process" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <WoGrid rows={rows} />}
      </div>
    </div>
  )
}
