import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { MaterialGrid, type MaterialRow } from './MaterialGrid'

export const dynamic = 'force-dynamic'

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const q = ((await searchParams).q ?? '').trim()
  let rows: MaterialRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<MaterialRow[]>(`/materials${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('raw.title', 'Raw Material·GPI')} (M-3-2)`} count={err ? undefined : rows.length} source="/materials" />
      <div style={{ padding: '4px 6px 0' }}><SearchBox placeholder={t('materials.searchPlaceholder', '자재 코드·명 검색')} /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <MaterialGrid rows={rows} />}
      </div>
    </div>
  )
}
