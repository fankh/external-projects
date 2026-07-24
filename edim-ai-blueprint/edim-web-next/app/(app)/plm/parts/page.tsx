import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { XlsxButton } from '@/components/XlsxButton'
import { PartGrid, type PartRow } from './PartGrid'
import { PartImportForm, PartRegForm, SubstitutePanel, SupplierCodePanel, type SubstituteRow, type SupplierCodeRow } from './PartsPanel'
import { SearchBox } from '@/components/SearchBox'

export const dynamic = 'force-dynamic'

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ no?: string; q?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  let rows: PartRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PartRow[]>(`/parts${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const selNo = sp.no && rows.some((r) => r.partNo === sp.no) ? sp.no : null
  let suppliers: SupplierCodeRow[] = []
  let substitutes: SubstituteRow[] = []
  if (selNo) {
    ;[suppliers, substitutes] = await Promise.all([
      apiServer<SupplierCodeRow[]>(`/parts/${encodeURIComponent(selNo)}/supplier-codes`).catch(() => []),
      apiServer<SubstituteRow[]>(`/parts/${encodeURIComponent(selNo)}/substitutes`).catch(() => []),
    ])
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.plm-parts', '부품 대장 (M-4-7)')} count={err ? undefined : rows.length} source="/parts" right={<XlsxButton kind="parts" />} />
      <div style={{ padding: '4px 6px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <PartRegForm />
        <PartImportForm />
        <SearchBox placeholder={t('parts.searchPlaceholder', '부품번호·품명·사양 검색')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><PartGrid rows={rows} selectedNo={selNo} /></div>
            <div style={{ width: 330, overflow: 'auto' }}>
              {selNo
                ? <><SupplierCodePanel partNo={selNo} rows={suppliers} /><SubstitutePanel partNo={selNo} rows={substitutes} /></>
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('parts.selectHint', '행을 클릭하면 공급자 코드 매핑을 관리합니다')}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
