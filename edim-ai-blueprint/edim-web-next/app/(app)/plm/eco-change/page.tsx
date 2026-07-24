import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { EcoGrid, type EcoChange } from './EcoGrid'
import { EcrForm } from './EcrForm'

export const dynamic = 'force-dynamic'

export default async function EcoChangePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const q = ((await searchParams).q ?? '').trim()

  let rows: EcoChange[] = []
  let err: string | null = null
  try {
    rows = await apiServer<EcoChange[]>(`/eco/changes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('eco.screenTitle', '설계 변경 (ECR/ECO)')} count={err ? undefined : rows.length} cap={2000} source="/eco/changes" />
      <div style={{ padding: '4px 6px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <EcrForm />
        <SearchBox placeholder={t('eco.searchPlaceholder', 'ECO번호·제목·대상 검색')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div> : <EcoGrid rows={rows} searchActive={!!q} />}
      </div>
    </div>
  )
}
