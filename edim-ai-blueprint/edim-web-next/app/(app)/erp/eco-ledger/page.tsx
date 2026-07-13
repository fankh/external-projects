import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { EcoLedgerTable, type EcoRow } from './EcoLedgerTable'

interface Ledger {
  summary: { total: number; applied: number; pending: number; rejected: number }
  rows: EcoRow[]
}

// 항상 최신 ERP 데이터 (요청 시 SSR)
export const dynamic = 'force-dynamic'

export default async function EcoLedgerPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  let data: Ledger | null = null
  let err: string | null = null
  try {
    data = await apiServer<Ledger>('/eco/ledger')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>
          {t('menu.plm-eco-ledger', '변경 이력 대장')}
        </span>
        {data ? (
          <>
            <span className="chip info">총 {data.summary.total}</span>
            <span className="chip ok">적용 {data.summary.applied}</span>
            <span className="chip warn">진행 {data.summary.pending}</span>
            <span className="chip warn">반려 {data.summary.rejected}</span>
          </>
        ) : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /eco/ledger</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        ) : data && data.rows.length ? (
          <EcoLedgerTable rows={data.rows} />
        ) : (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>변경 이력이 없습니다</div>
        )}
      </div>
    </div>
  )
}
