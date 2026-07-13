'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface TempletRow { name: string; templetType: string; definition: string; status: string; system: boolean }

const cols: GridColumn<TempletRow>[] = [
  { key: 'name', header: 'Templet', width: 160, code: true, render: (r) => r.name },
  { key: 'type', header: '유형', width: 110, align: 'center', sortValue: (r) => r.templetType, render: (r) => r.templetType },
  { key: 'def', header: '정의', render: (r) => r.definition || '—' },
  { key: 'sys', header: '시스템', width: 64, align: 'center', sortValue: (r) => (r.system ? 1 : 0), render: (r) => r.system ? <Chip tone="info">시스템</Chip> : <Chip tone="ok">커스텀</Chip> },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'ACTIVE' ? 'ok' : 'info'}>{r.status}</Chip> },
]

export function TempletGrid({ rows }: { rows: TempletRow[] }) {
  return <DenseGrid prefKey="next-templets" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.name} emptyText="Templet 이 없습니다" />
}
