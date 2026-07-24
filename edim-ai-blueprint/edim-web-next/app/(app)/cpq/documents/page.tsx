import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { DocGrid, type DocRow } from './DocGrid'

export const dynamic = 'force-dynamic'

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const q = ((await searchParams).q ?? '').trim()
  let rows: DocRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<DocRow[]>(`/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.cpq-docmgmt', '문서함 (M-5-4)')} count={err ? undefined : rows.length} cap={2000} source="/documents" />
      <div style={{ padding: '4px 6px 0' }}><SearchBox placeholder={t('doc.searchPlaceholder', '문서번호·제목 검색')} /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <DocGrid rows={rows} searchActive={!!q} />}
      </div>
    </div>
  )
}
