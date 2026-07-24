import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { XlsxButton } from '@/components/XlsxButton'
import { DrawingGrid, type DrawingRow } from './DrawingGrid'
import { DrawingDetail, DrawingRegForm, type RevisionRow, type StepRow } from './DrawingsPanel'
import { SearchBox } from '@/components/SearchBox'

export const dynamic = 'force-dynamic'

export default async function DrawingsPage({ searchParams }: { searchParams: Promise<{ no?: string; q?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  let rows: DrawingRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<DrawingRow[]>(`/drawings${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const selNo = sp.no && rows.some((r) => r.drawingNo === sp.no) ? sp.no : null
  let revisions: RevisionRow[] = []
  let steps: StepRow[] = []
  let variants: { drawingNo: string; name: string; status: string }[] = []
  let files: { fileId: number; fileName: string; fileType: string }[] = []
  if (selNo) {
    ;[revisions, steps, variants, files] = await Promise.all([
      apiServer<RevisionRow[]>(`/drawings/${encodeURIComponent(selNo)}/revisions`).catch(() => []),
      apiServer<StepRow[]>(`/drawings/${encodeURIComponent(selNo)}/approvals`).catch(() => []),
      apiServer<{ drawingNo: string; name: string; status: string }[]>(`/drawings/${encodeURIComponent(selNo)}/variants`).catch(() => []),
      apiServer<{ fileId: number; fileName: string; fileType: string }[]>(`/drawings/${encodeURIComponent(selNo)}/files`).catch(() => []),
    ])
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('menu.plm-drawings', '도면 대장 (M-4-1)')} count={err ? undefined : rows.length} source="/drawings" right={<XlsxButton kind="drawings" />} />
      <div style={{ padding: '4px 6px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <DrawingRegForm />
        <SearchBox placeholder={t('drawings.searchPlaceholder', '도면번호·도면명 검색')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><DrawingGrid rows={rows} selectedNo={selNo} searchActive={!!q} /></div>
            <div style={{ width: 340, overflow: 'auto' }}>
              {selNo
                ? <DrawingDetail no={selNo} revisions={revisions} steps={steps} variants={variants} files={files} />
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.selectHint', '행을 클릭하면 Rev 이력·단계 승인·Supersedure 를 관리합니다')}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
