'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface Milestone {
  milestoneId: number; projectNo: string; stage: string; stageLabel: string
  plannedDate: string; actualDate: string | null; status: 'PENDING' | 'DONE'
  note: string; delayStatus: 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'PENDING'
  daysLeft: number; workdaysLeft: number
}

const DTONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { DONE: 'ok', OVERDUE: 'err', DUE_SOON: 'warn', PENDING: 'info' }
const DLABEL: Record<string, string> = { DONE: '완료', OVERDUE: '지연', DUE_SOON: '임박', PENDING: '대기' }

const cols: GridColumn<Milestone>[] = [
  { key: 'proj', header: '프로젝트', width: 100, code: true, render: (r) => r.projectNo },
  { key: 'stage', header: '단계', width: 80, align: 'center', sortValue: (r) => r.stage, render: (r) => r.stageLabel || r.stage },
  { key: 'planned', header: '계획일', width: 100, align: 'center', render: (r) => r.plannedDate },
  { key: 'actual', header: '실적일', width: 100, align: 'center', render: (r) => r.actualDate || '—' },
  { key: 'delay', header: '상태', width: 72, align: 'center', sortValue: (r) => r.delayStatus, render: (r) => <Chip tone={DTONE[r.delayStatus] ?? 'info'}>{DLABEL[r.delayStatus] ?? r.delayStatus}</Chip> },
  { key: 'wd', header: '영업일 잔여', width: 84, align: 'right', sortValue: (r) => r.workdaysLeft, render: (r) => r.status === 'DONE' ? '—' : r.workdaysLeft },
  { key: 'note', header: '비고', render: (r) => r.note || '—' },
]

export function MilestoneGrid({ rows }: { rows: Milestone[] }) {
  return <DenseGrid prefKey="next-milestones" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.milestoneId} emptyText="마일스톤이 없습니다" />
}
