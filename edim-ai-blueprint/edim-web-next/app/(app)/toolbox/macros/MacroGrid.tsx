'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface MacroRow {
  name: string; expr: string; status: string; address: string; prompt: string
  description: string; codeText: string; flowchartDef: string; applyType: string; version: string
}

const cols: GridColumn<MacroRow>[] = [
  { key: 'name', header: 'Macro', width: 130, code: true, render: (r) => r.name },
  { key: 'apply', header: '적용', width: 84, align: 'center', sortValue: (r) => r.applyType, render: (r) => r.applyType || '—' },
  { key: 'expr', header: '수식', code: true, render: (r) => r.expr || '—' },
  { key: 'desc', header: '설명', render: (r) => r.description || '—' },
  { key: 'ver', header: 'Ver', width: 52, align: 'center', render: (r) => r.version || '—' },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'info'}>{r.status}</Chip> },
]

export function MacroGrid({ rows }: { rows: MacroRow[] }) {
  return <DenseGrid prefKey="next-macros" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.name} emptyText="Macro 가 없습니다" />
}
