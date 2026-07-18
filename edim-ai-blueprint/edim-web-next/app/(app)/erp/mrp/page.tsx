import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MrpGrid, type MrpData } from './MrpGrid'

export const dynamic = 'force-dynamic'

/** MRP 자재 소요 계획 (U4·M-8-5, ERP-022) — 수주(ORDERED) 자재 라인 × 현재고. */
export default async function MrpPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const lead = Math.max(0, Math.min(90, Number(sp.lead) || 14))
  let data: MrpData | null = null
  let err: string | null = null
  try {
    data = await apiServer<MrpData>(`/erp/mrp?leadDays=${lead}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('mrp.title', 'MRP 자재 소요 계획')} (M-8-5)`}
        count={err || !data ? undefined : data.rows.length} source="/erp/mrp" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err || !data ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div>
        ) : (
          <MrpGrid data={data} />
        )}
      </div>
    </div>
  )
}
