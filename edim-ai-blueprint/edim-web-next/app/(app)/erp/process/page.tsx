import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ProcGrid, type ProcRow } from './ProcGrid'

export const dynamic = 'force-dynamic'

export default async function ProcessPage() {
  let rows: ProcRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<ProcRow[]>('/erp/process-defs')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="프로세스 정의 (S-4-1-2)" count={err ? undefined : rows.length} source="/erp/process-defs" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <ProcGrid rows={rows} />}
      </div>
    </div>
  )
}
