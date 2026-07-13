import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

interface Report { id: string; name: string; category: string; kind: string; count: number | null; screen: string; desc: string }

export const dynamic = 'force-dynamic'

// 순수 서버 컴포넌트(클라이언트 JS 0) — SSR-only 화면 예시.
export default async function ReportCenterPage() {
  let rows: Report[] = []
  let err: string | null = null
  try {
    rows = await apiServer<Report[]>('/reports/catalog')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Report Center (RPT)" count={err ? undefined : rows.length} countLabel="종" source="/reports/catalog" />
      <div style={{ flex: 1, minHeight: 0, padding: 10, overflow: 'auto' }}>
        {err ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} className="gb" style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="chip info">{r.category}</span>
                  <span className="chip ok">{r.kind}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{r.count ?? '—'}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--title-navy)' }}>{r.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3, lineHeight: 1.6 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
