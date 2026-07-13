import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FinanceGrids, type FxRow, type TaxRow } from './FinanceGrids'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  let fx: FxRow[] = []
  let tax: TaxRow[] = []
  let err: string | null = null
  try {
    ;[fx, tax] = await Promise.all([
      apiServer<FxRow[]>('/finance/fx'),
      apiServer<TaxRow[]>('/finance/tax-codes'),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="다통화·세금 마스터 (M-13-1)" count={err ? undefined : fx.length + tax.length} source="/finance/fx · /finance/tax-codes" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <FinanceGrids fx={fx} tax={tax} />}
      </div>
    </div>
  )
}
