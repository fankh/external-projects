import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PoGrid, type PoRow } from './PoGrid'
import { PoCreateForm, PoDetailPanel, type PoDetail } from './PoPanel'

export const dynamic = 'force-dynamic'

export default async function PoPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  let rows: PoRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PoRow[]>('/erp/pos')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const selNo = sp.no && rows.some((r) => r.poNo === sp.no) ? sp.no : null
  let detail: PoDetail | null = null
  if (selNo) {
    detail = await apiServer<PoDetail>(`/erp/pos/${encodeURIComponent(selNo)}`).catch(() => null)
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="발주 대장 (G-3)" count={err ? undefined : rows.length} source="/erp/pos" />
      <div style={{ padding: '4px 6px 0' }}><PoCreateForm /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><PoGrid rows={rows} selectedNo={selNo} /></div>
            <div style={{ width: 380, overflow: 'auto' }}>
              {detail
                ? <PoDetailPanel detail={detail} />
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>행을 클릭하면 라인·승인·입고(GR)를 관리합니다</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
