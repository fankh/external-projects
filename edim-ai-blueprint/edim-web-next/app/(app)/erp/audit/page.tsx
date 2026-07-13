import { apiServer, ApiError } from '@/lib/api'
import { AuditGrid, type AuditRow } from './AuditGrid'

interface AuditData { rows: AuditRow[]; actions?: string[]; users?: string[] }

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  let data: AuditData | null = null
  let err: string | null = null
  try {
    data = await apiServer<AuditData>('/audit?limit=200')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>감사 조회 (M-14-6A)</span>
        {data ? <span className="chip info">{data.rows.length}건</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /audit (ADMIN)</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        ) : (
          <AuditGrid rows={data?.rows ?? []} />
        )}
      </div>
    </div>
  )
}
