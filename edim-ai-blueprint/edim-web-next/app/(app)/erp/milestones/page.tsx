import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MilestoneGrid, type Milestone } from './MilestoneGrid'

export const dynamic = 'force-dynamic'

export default async function MilestonesPage() {
  let rows: Milestone[] = []
  let err: string | null = null
  try {
    rows = await apiServer<Milestone[]>('/erp/milestones')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="일정·마일스톤 (D-7)" count={err ? undefined : rows.length} source="/erp/milestones" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <MilestoneGrid rows={rows} />}
      </div>
    </div>
  )
}
