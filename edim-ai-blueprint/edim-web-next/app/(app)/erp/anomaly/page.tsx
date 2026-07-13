import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AnomalyGrid, type AnomalyRow } from './AnomalyGrid'

export const dynamic = 'force-dynamic'

export default async function AnomalyPage() {
  let rows: AnomalyRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<AnomalyRow[]>('/anomalies')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="이상 이벤트 (M-14-4A)" count={err ? undefined : rows.length} source="/anomalies" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <AnomalyGrid rows={rows} />}
      </div>
    </div>
  )
}
