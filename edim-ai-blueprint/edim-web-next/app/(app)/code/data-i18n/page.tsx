import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { I18nEditor, type DataTransRow } from './I18nEditor'

export const dynamic = 'force-dynamic'

const ENTITIES = ['COMPANY', 'PRODUCT', 'DOCUMENT']

export default async function DataI18nPage({ searchParams }: { searchParams: Promise<{ entity?: string; locale?: string }> }) {
  const sp = await searchParams
  const entity = ENTITIES.includes(sp.entity ?? '') ? sp.entity! : 'COMPANY'
  const locale = (sp.locale ?? 'en').trim() || 'en'
  let rows: DataTransRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<DataTransRow[]>(`/i18n/data/${entity}?locale=${encodeURIComponent(locale)}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const done = rows.filter((r) => r.value).length
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="데이터 다국어 (M-3-9)" count={err ? undefined : `${done}/${rows.length}`} countLabel="번역" source="/i18n/data/{type}" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
          : <I18nEditor rows={rows} entity={entity} locale={locale} />}
      </div>
    </div>
  )
}
