import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MaterialGrid, type MaterialRow } from './MaterialGrid'

export const dynamic = 'force-dynamic'

export default async function MaterialsPage() {
  let rows: MaterialRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<MaterialRow[]>('/materials')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Raw Material·GPI (M-3-2)" count={err ? undefined : rows.length} source="/materials" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <MaterialGrid rows={rows} />}
      </div>
    </div>
  )
}
