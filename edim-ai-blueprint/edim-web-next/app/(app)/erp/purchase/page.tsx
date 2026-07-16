import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PrGrid, type PrRow } from './PrGrid'

export const dynamic = 'force-dynamic'

export default async function PurchasePage() {
  const locale = await getLocale()
  const t = (k: string, ko: string) => translate(bundleFor(locale), k, ko)
  let rows: PrRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PrRow[]>('/erp/pr-items')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('purch.title', '구매·발주 요청')} (M-8-2)`} count={err ? undefined : rows.length} source="/erp/pr-items" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <PrGrid rows={rows} />}
      </div>
    </div>
  )
}
