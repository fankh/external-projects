import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { VariantGrid, type CodeValueRow } from './VariantGrid'

export const dynamic = 'force-dynamic'

export default async function VariantPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const sp = await searchParams
  const group = (sp.group ?? 'KOF').trim() || 'KOF'
  let rows: CodeValueRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<CodeValueRow[]>(`/codes/values?group=${encodeURIComponent(group)}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`배리언트 상수 (S-1-2) — ${group}`} count={err ? undefined : rows.length} source="/codes/values" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <VariantGrid rows={rows} group={group} />}
      </div>
    </div>
  )
}
