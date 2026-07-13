'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface TaskRow {
  eventId: number; code: string; procName: string; project: string
  owner: string; deadline: string; delayed: boolean; status: string
}

const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { DONE: 'ok', '지연': 'err', '진행': 'info', TODO: 'warn' }

const cols: GridColumn<TaskRow>[] = [
  { key: 'code', header: '공정', width: 64, align: 'center', code: true, render: (r) => r.code },
  { key: 'proc', header: '업무', render: (r) => r.procName },
  { key: 'proj', header: 'Project', width: 110, render: (r) => r.project },
  { key: 'owner', header: '담당', width: 80, align: 'center', render: (r) => r.owner },
  { key: 'deadline', header: '기한', width: 72, align: 'center', render: (r) => r.deadline },
  { key: 'status', header: '상태', width: 72, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.delayed ? 'err' : (TONE[r.status] ?? 'info')}>{r.status}</Chip> },
]

export function TaskGrid({ rows }: { rows: TaskRow[] }) {
  return <DenseGrid prefKey="next-tasks" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.eventId} emptyText="업무가 없습니다" />
}
