'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface AnomalyRow {
  anomalyId: number; source: string; severity: string; title: string
  refNo: string; status: string; createdAt: string; resolvedAt: string | null
}

const SEV: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { HIGH: 'err', MEDIUM: 'warn', LOW: 'info' }

const cols: GridColumn<AnomalyRow>[] = [
  { key: 'sev', header: '심각도', width: 72, align: 'center', sortValue: (r) => r.severity, render: (r) => <Chip tone={SEV[r.severity] ?? 'info'}>{r.severity}</Chip> },
  { key: 'source', header: '출처', width: 90, align: 'center', sortValue: (r) => r.source, render: (r) => r.source },
  { key: 'title', header: '내용', render: (r) => r.title },
  { key: 'ref', header: '참조', width: 110, code: true, render: (r) => r.refNo || '—' },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'RESOLVED' ? 'ok' : 'warn'}>{r.status}</Chip> },
  { key: 'at', header: '발생', width: 110, align: 'center', render: (r) => r.createdAt },
]

export function AnomalyGrid({ rows }: { rows: AnomalyRow[] }) {
  return <DenseGrid prefKey="next-anomaly" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.anomalyId} emptyText="이상 이벤트가 없습니다" />
}
