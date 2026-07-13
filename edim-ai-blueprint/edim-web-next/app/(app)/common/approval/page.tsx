import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ApprovalGrid, type ApprovalRow } from './ApprovalGrid'

export const dynamic = 'force-dynamic'

export default async function ApprovalPage() {
  let rows: ApprovalRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<ApprovalRow[]>('/approvals/inbox')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="승인함 (M-15-2)" count={err ? undefined : rows.length} countLabel="대기" source="/approvals/inbox" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <ApprovalGrid rows={rows} />}
      </div>
    </div>
  )
}
