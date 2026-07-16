import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DataTableGrid, type TableRow } from './DataTableGrid'

interface TableData { name: string; columns: string[]; rows: TableRow[] }

export const dynamic = 'force-dynamic'

export default async function DataTablePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const name = (sp.name ?? 'Table12').trim() || 'Table12'
  let data: TableData | null = null
  let err: string | null = null
  try {
    data = await apiServer<TableData>(`/tables/${encodeURIComponent(name)}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('menu.code-datatable', '데이터 Table (M-3-7)')} — ${name}`} count={err ? undefined : data?.rows.length ?? 0} source="/tables/{name}" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
          : <DataTableGrid name={name} columns={data?.columns ?? []} rows={data?.rows ?? []} />}
      </div>
    </div>
  )
}
