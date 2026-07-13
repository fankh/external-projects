import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PoGrid, type PoRow } from './PoGrid'

export const dynamic = 'force-dynamic'

export default async function PoPage() {
  let rows: PoRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PoRow[]>('/erp/pos')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="발주 대장 (G-3)" count={err ? undefined : rows.length} source="/erp/pos" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <PoGrid rows={rows} />}
      </div>
    </div>
  )
}
