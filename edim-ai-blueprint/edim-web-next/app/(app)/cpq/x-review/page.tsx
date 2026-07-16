import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { XReviewGrid, type XRow } from './XReviewGrid'

export const dynamic = 'force-dynamic'

export default async function XReviewPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: XRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<XRow[]>('/cpq/x-review')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.cpq-xreview', 'X-code 검토 (C-1X)')} count={err ? undefined : rows.length} countLabel={t('xreview.waiting', '대기')} source="/cpq/x-review" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <XReviewGrid rows={rows} />}
      </div>
    </div>
  )
}
