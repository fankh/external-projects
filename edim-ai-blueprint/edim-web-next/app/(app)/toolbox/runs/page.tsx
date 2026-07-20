import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { RunGrid, type RunRow } from './RunGrid'
import { SnapshotPanel } from './SnapshotPanel'
import type { SnapshotRow } from './actions'

export const dynamic = 'force-dynamic'

export default async function RunsPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: RunRow[] = []
  let snaps: SnapshotRow[] = []
  let err: string | null = null
  try {
    ;[rows, snaps] = await Promise.all([
      apiServer<RunRow[]>('/cpq/runs'),
      apiServer<SnapshotRow[]>('/snapshots').catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const latestRunId = rows.find((r) => r.status === 'SUCCESS')?.runId ?? rows[0]?.runId ?? null
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('runs.title', 'Run 이력·정리')} (E-3)`} count={err ? undefined : rows.length} source="/cpq/runs · /snapshots" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <RunGrid rows={rows} />
            <SnapshotPanel rows={snaps} latestRunId={latestRunId} />
          </>
        )}
      </div>
    </div>
  )
}
