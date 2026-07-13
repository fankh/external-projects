import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { TempletGrid, type TempletRow } from './TempletGrid'

export const dynamic = 'force-dynamic'

export default async function TempletsPage() {
  let rows: TempletRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<TempletRow[]>('/toolbox/templets')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Templet 관리 (S-2-3)" count={err ? undefined : rows.length} source="/toolbox/templets" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <TempletGrid rows={rows} />}
      </div>
    </div>
  )
}
