import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DataTableGrid, type TableRow } from './DataTableGrid'

interface TableData { name: string; columns: string[]; rows: TableRow[] }
interface ImpactRow { macro: string; status: string; applyType: string }

export const dynamic = 'force-dynamic'

export default async function DataTablePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const name = (sp.name ?? 'Table12').trim() || 'Table12'
  let data: TableData | null = null
  let impact: ImpactRow[] = []
  let err: string | null = null
  try {
    ;[data, impact] = await Promise.all([
      apiServer<TableData>(`/tables/${encodeURIComponent(name)}`),
      apiServer<ImpactRow[]>(`/tables/${encodeURIComponent(name)}/impact`).catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('menu.code-datatable', '데이터 Table (M-3-7)')} — ${name}`} count={err ? undefined : data?.rows.length ?? 0} source="/tables/{name} · impact" />
      {/* 영향도 (GET /tables/{name}/impact) — 이 Table 을 참조하는 Macro (변경 전 확인) */}
      {!err ? (
        <div data-table-impact style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '3px 8px', fontSize: 10.5, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
          <b style={{ color: 'var(--title-navy)' }}>{t('dt.impactTitle', '영향도')}</b>
          {impact.length ? impact.map((m) => (
            <span key={m.macro} className="st info" title={`${m.status} · ${m.applyType}`}>ƒ {m.macro}</span>
          )) : <span style={{ color: 'var(--txt-mute)' }}>{t('dt.noImpact', '참조 Macro 없음 — 자유 변경 가능')}</span>}
          {impact.length ? <span style={{ color: 'var(--txt-mute)' }}>{t('dt.impactHint', '— 참조 Macro 존재: 값 변경 시 산식 결과 영향')}</span> : null}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
          : <DataTableGrid name={name} columns={data?.columns ?? []} rows={data?.rows ?? []} />}
      </div>
    </div>
  )
}
