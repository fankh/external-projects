import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { OrderGrid, type OrderRow } from './OrderGrid'
import { QuotationPanel, type QuotationRow } from './QuotationPanel'
import { HandoffPanel } from './HandoffPanel'
import type { HandoffRow, RunOption } from './handoffActions'

interface Orders { orders: OrderRow[]; orderRate?: number; totalContract?: number }
interface RunRow { runId: number; status: string; startedAt: string; isTest?: boolean }

export const dynamic = 'force-dynamic'

export default async function SalesOrderPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let data: Orders | null = null
  let quotations: QuotationRow[] = []
  let handoffs: HandoffRow[] = []
  let runOpts: RunOption[] = []
  let err: string | null = null
  try {
    let runs: RunRow[] = []
    ;[data, quotations, handoffs, runs] = await Promise.all([
      apiServer<Orders>('/cost/orders'),
      apiServer<QuotationRow[]>('/cost/quotations').catch(() => []),
      apiServer<HandoffRow[]>('/erp/handoffs').catch(() => []),
      apiServer<RunRow[]>('/cpq/runs').catch(() => []),
    ])
    runOpts = runs.filter((r) => r.status === 'SUCCESS' && !r.isTest).slice(0, 8)
      .map((r) => ({ runId: r.runId, startedAt: r.startedAt }))
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const rows = data?.orders ?? []
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('order.title', '수주 관리')} (D-1)`} count={err ? undefined : rows.length} countLabel={t('so.orderUnit', '수주')} source="/cost/orders · /cost/quotations" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <HandoffPanel rows={handoffs} runs={runOpts} />
          <QuotationPanel rows={quotations} />
          <div className="gb" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('so.backlog', '수주 잔고 (ORDERED)')}</div>
            <div style={{ flex: 1, minHeight: 0 }}><OrderGrid rows={rows} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
