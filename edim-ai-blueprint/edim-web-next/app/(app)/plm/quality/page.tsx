import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { QualityView, type VerificationRow } from './QualityView'

export const dynamic = 'force-dynamic'

export default async function QualityPage({ searchParams }: { searchParams: Promise<{ drawing?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  const sp = await searchParams
  const drawing = (sp.drawing ?? 'KDCR 3-13').trim() || 'KDCR 3-13'
  let rows: VerificationRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<VerificationRow[]>(`/drawings/${encodeURIComponent(drawing)}/verifications`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('quality.title', '설계 검증 규칙 (D-4V)')} — ${drawing}`} count={err ? undefined : rows.length} countLabel="rule" source="/drawings/{no}/verifications" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div> : <QualityView rows={rows} drawing={drawing} />}
    </div>
  )
}
