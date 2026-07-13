import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { GroupGrid, type GroupRow } from './GroupGrid'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  let rows: GroupRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<GroupRow[]>('/codes/groups')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="코드 그룹 (S-1)" count={err ? undefined : rows.length} source="/codes/groups" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <GroupGrid rows={rows} />}
      </div>
    </div>
  )
}
