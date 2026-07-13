import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DrawingGrid, type DrawingRow } from './DrawingGrid'

export const dynamic = 'force-dynamic'

export default async function DrawingsPage() {
  let rows: DrawingRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<DrawingRow[]>('/drawings')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="도면 대장 (M-4-1)" count={err ? undefined : rows.length} source="/drawings" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <DrawingGrid rows={rows} />}
      </div>
    </div>
  )
}
