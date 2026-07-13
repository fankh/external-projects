import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PartGrid, type PartRow } from './PartGrid'

export const dynamic = 'force-dynamic'

export default async function PartsPage() {
  let rows: PartRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PartRow[]>('/parts')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="부품 대장 (M-4-7)" count={err ? undefined : rows.length} source="/parts" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <PartGrid rows={rows} />}
      </div>
    </div>
  )
}
