import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { CompanyGrid, type CompanyRow } from './CompanyGrid'
import { CompanyForm } from './CompanyForm'
import { SupplierPanel, type SupplierEval, type SupplierMetrics } from './SupplierPanel'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: CompanyRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<CompanyRow[]>('/companies')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const selId = sp.sel ? Number(sp.sel) : null
  const sel = selId != null ? rows.find((r) => r.companyId === selId) ?? null : null
  let metrics: SupplierMetrics | null = null
  let evals: SupplierEval[] = []
  if (sel?.companyId != null) {
    ;[metrics, evals] = await Promise.all([
      apiServer<SupplierMetrics>(`/erp/suppliers/${sel.companyId}/metrics`).catch(() => null),
      apiServer<SupplierEval[]>(`/erp/suppliers/evals?company_id=${sel.companyId}`).catch(() => []),
    ])
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.erp-company-master', '거래처 대장 (M-14-2)')} count={err ? undefined : rows.length} source="/companies" />
      <CompanyForm />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><CompanyGrid rows={rows} selectedId={selId} /></div>
            <div style={{ width: 380, overflow: 'auto' }}><SupplierPanel metrics={metrics} evals={evals} /></div>
          </>
        )}
      </div>
    </div>
  )
}
