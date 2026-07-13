'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface WoRow {
  woNo: string; title: string; drawingNo: string; projectNo: string
  status: string; assignee: string; issuedAt: string; doneAt: string | null; assemblyNote: string
}

const cols: GridColumn<WoRow>[] = [
  { key: 'no', header: '작업지시', width: 110, code: true, render: (r) => r.woNo },
  { key: 'title', header: '제목', render: (r) => r.title },
  { key: 'dwg', header: '도면', width: 110, code: true, render: (r) => r.drawingNo || '—' },
  { key: 'proj', header: 'Project', width: 100, render: (r) => r.projectNo || '—' },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'DONE' ? 'ok' : 'info'}>{r.status}</Chip> },
  { key: 'assignee', header: '담당', width: 80, align: 'center', render: (r) => r.assignee || '—' },
  { key: 'issued', header: '지시일', width: 96, align: 'center', render: (r) => r.issuedAt },
]

export function WoGrid({ rows }: { rows: WoRow[] }) {
  return <DenseGrid prefKey="next-wo" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.woNo} emptyText="작업지시가 없습니다" />
}
