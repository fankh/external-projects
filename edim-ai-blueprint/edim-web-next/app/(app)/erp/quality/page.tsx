import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { QcGrid, type QcRow } from './QcGrid'

export const dynamic = 'force-dynamic'

export default async function QualityPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const q = ((await searchParams).q ?? '').trim()
  let rows: QcRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<QcRow[]>(`/qc/inspections${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="검사·품질 (D-4)" count={err ? undefined : rows.length} cap={2000} source="/qc/inspections" />
      <div style={{ padding: '4px 6px 0' }}><SearchBox placeholder={t('qc.searchPlaceholder', '검사번호·참조·품목 검색')} /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <QcGrid rows={rows} searchActive={!!q} />}
      </div>
    </div>
  )
}
