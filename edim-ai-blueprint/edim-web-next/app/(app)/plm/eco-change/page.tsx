import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { EcoGrid, type EcoChange } from './EcoGrid'

export const dynamic = 'force-dynamic'

export default async function EcoChangePage() {
  let rows: EcoChange[] = []
  let err: string | null = null
  try {
    rows = await apiServer<EcoChange[]>('/eco/changes')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="설계 변경 (ECR/ECO)" count={err ? undefined : rows.length} source="/eco/changes" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <EcoGrid rows={rows} />}
      </div>
    </div>
  )
}
