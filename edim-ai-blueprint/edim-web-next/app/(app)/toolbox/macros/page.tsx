import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MacroGrid, type MacroRow } from './MacroGrid'

export const dynamic = 'force-dynamic'

export default async function MacrosPage() {
  let rows: MacroRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<MacroRow[]>('/macros')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Macro Studio (S-2-2)" count={err ? undefined : rows.length} source="/macros" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <MacroGrid rows={rows} />}
      </div>
    </div>
  )
}
