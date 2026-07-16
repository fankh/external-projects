import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ArrangementCanvas } from './ArrangementCanvas'
import { ArrangementGrid, ArrangementRegForm, ComponentPanel, type ArrangementComponent, type ArrangementRow } from './ArrangementView'

export const dynamic = 'force-dynamic'

export default async function ArrangementPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  let rows: ArrangementRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<ArrangementRow[]>('/arrangements')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const selCode = sp.code && rows.some((r) => r.code === sp.code) ? sp.code : null
  let components: ArrangementComponent[] = []
  if (selCode) {
    components = await apiServer<ArrangementComponent[]>(`/arrangements/${encodeURIComponent(selCode)}/components`).catch(() => [])
  }
  let doc: CadDocument | null = null
  try {
    const r = await apiServer<{ document: CadDocument }>('/cad/arrangement')
    doc = r.document
  } catch { /* 구성도 캔버스는 보조 — 실패 시 생략 */ }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('arr.title', 'Arrangement Set-Up (M-4-2)')} count={err ? undefined : rows.length} source="/arrangements" />
      <div style={{ padding: '4px 6px 0' }}><ArrangementRegForm /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ flex: 1, minHeight: 0 }}><ArrangementGrid rows={rows} selectedCode={selCode} /></div>
              {doc ? <div style={{ height: 260, minHeight: 0 }}><ArrangementCanvas doc={doc} /></div> : null}
            </div>
            <div style={{ width: 340, overflow: 'auto' }}>
              {selCode
                ? <ComponentPanel code={selCode} rows={components} />
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('arr.selectHint', '행을 클릭하면 구성품을 관리합니다')}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
