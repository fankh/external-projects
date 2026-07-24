import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { PoGrid, type PoRow } from './PoGrid'
import { PoCreateForm, PoDetailPanel, type PoDetail } from './PoPanel'

export const dynamic = 'force-dynamic'

export default async function PoPage({ searchParams }: { searchParams: Promise<{ no?: string; q?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  let rows: PoRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PoRow[]>(`/erp/pos${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const selNo = sp.no && rows.some((r) => r.poNo === sp.no) ? sp.no : null
  let detail: PoDetail | null = null
  if (selNo) {
    detail = await apiServer<PoDetail>(`/erp/pos/${encodeURIComponent(selNo)}`).catch(() => null)
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('po.ledger', '발주 대장')} (G-3)`} count={err ? undefined : rows.length} cap={2000} source="/erp/pos" />
      <div style={{ padding: '4px 6px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <PoCreateForm />
        <SearchBox placeholder={t('po.searchPlaceholder', '발주번호·공급처 검색')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><PoGrid rows={rows} selectedNo={selNo} searchActive={!!q} /></div>
            <div style={{ width: 380, overflow: 'auto' }}>
              {detail
                ? <PoDetailPanel detail={detail} />
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('po.selectHint', '행을 클릭하면 라인·승인·입고(GR)를 관리합니다')}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
