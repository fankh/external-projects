import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AccessDenied } from '@/components/AccessDenied'
import { hasLevel } from '@/lib/auth'
import { RoleGrid, type RoleRow } from './RoleGrid'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  if (!(await hasLevel('SETUP'))) return <AccessDenied minLevel="SETUP" />
  let rows: RoleRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<RoleRow[]>('/roles')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="권한 매트릭스 (M-14-6)" count={err ? undefined : rows.length} countLabel="역할" source="/roles" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <RoleGrid rows={rows} />}
      </div>
    </div>
  )
}
