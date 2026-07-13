'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface ProcRow { id: number; code: string; name: string; dept: string; auto: boolean }

const cols: GridColumn<ProcRow>[] = [
  { key: 'code', header: '코드', width: 72, align: 'center', code: true, render: (r) => r.code },
  { key: 'name', header: '프로세스', render: (r) => r.name },
  { key: 'dept', header: '부서', width: 100, align: 'center', sortValue: (r) => r.dept, render: (r) => r.dept },
  { key: 'auto', header: '자동', width: 60, align: 'center', sortValue: (r) => (r.auto ? 1 : 0), render: (r) => r.auto ? <Chip tone="ok">자동</Chip> : <Chip tone="info">수동</Chip> },
]

export function ProcGrid({ rows }: { rows: ProcRow[] }) {
  return <DenseGrid prefKey="next-procs" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.id} emptyText="프로세스 정의가 없습니다" />
}
