import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DrawingGrid, type DrawingRow } from './DrawingGrid'
import { DrawingDetail, DrawingRegForm, type RevisionRow, type StepRow } from './DrawingsPanel'

export const dynamic = 'force-dynamic'

export default async function DrawingsPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  let rows: DrawingRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<DrawingRow[]>('/drawings')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const selNo = sp.no && rows.some((r) => r.drawingNo === sp.no) ? sp.no : null
  let revisions: RevisionRow[] = []
  let steps: StepRow[] = []
  if (selNo) {
    ;[revisions, steps] = await Promise.all([
      apiServer<RevisionRow[]>(`/drawings/${encodeURIComponent(selNo)}/revisions`).catch(() => []),
      apiServer<StepRow[]>(`/drawings/${encodeURIComponent(selNo)}/approvals`).catch(() => []),
    ])
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="도면 대장 (M-4-1)" count={err ? undefined : rows.length} source="/drawings" />
      <div style={{ padding: '4px 6px 0' }}><DrawingRegForm /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><DrawingGrid rows={rows} selectedNo={selNo} /></div>
            <div style={{ width: 340, overflow: 'auto' }}>
              {selNo
                ? <DrawingDetail no={selNo} revisions={revisions} steps={steps} />
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>행을 클릭하면 Rev 이력·단계 승인·Supersedure 를 관리합니다</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
