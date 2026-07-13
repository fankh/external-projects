import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { QcGrid, type QcRow } from './QcGrid'

export const dynamic = 'force-dynamic'

export default async function QualityPage() {
  let rows: QcRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<QcRow[]>('/qc/inspections')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="검사·품질 (D-4)" count={err ? undefined : rows.length} source="/qc/inspections" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <QcGrid rows={rows} />}
      </div>
    </div>
  )
}
