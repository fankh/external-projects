'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface RunRow {
  runId: number; status: string; runType: string; startedAt: string
  durationSec: number | null; outputCount: number; createdBy: string
  latest: boolean; referenced: boolean; protected: boolean
}

const cols: GridColumn<RunRow>[] = [
  { key: 'id', header: 'Run', width: 64, align: 'right', code: true, sortValue: (r) => r.runId, render: (r) => r.runId },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'SUCCESS' ? 'ok' : r.status === 'FAILED' ? 'err' : 'info'}>{r.status}</Chip> },
  { key: 'type', header: '유형', width: 90, align: 'center', sortValue: (r) => r.runType, render: (r) => r.runType },
  { key: 'started', header: '시작', width: 130, align: 'center', render: (r) => r.startedAt },
  { key: 'dur', header: '소요(s)', width: 72, align: 'right', sortValue: (r) => r.durationSec ?? 0, render: (r) => r.durationSec ?? '—' },
  { key: 'out', header: '산출물', width: 64, align: 'right', sortValue: (r) => r.outputCount, render: (r) => r.outputCount },
  { key: 'by', header: '수행자', width: 80, align: 'center', render: (r) => r.createdBy },
  { key: 'flag', header: '', width: 90, align: 'center', noSort: true, noFilter: true, render: (r) => <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>{r.latest ? <Chip tone="ok">최신</Chip> : null}{r.referenced ? <Chip tone="info">참조</Chip> : null}</span> },
]

export function RunGrid({ rows }: { rows: RunRow[] }) {
  return <DenseGrid prefKey="next-runs" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.runId} emptyText="Run 이력이 없습니다" />
}
