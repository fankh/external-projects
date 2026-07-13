import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { RunGrid, type RunRow } from './RunGrid'

export const dynamic = 'force-dynamic'

export default async function RunsPage() {
  let rows: RunRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<RunRow[]>('/cpq/runs')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Run 이력·정리 (E-3)" count={err ? undefined : rows.length} source="/cpq/runs" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <RunGrid rows={rows} />}
      </div>
    </div>
  )
}
