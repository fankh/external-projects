'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface RoleRow {
  name: string; description: string; permissions?: Record<string, string>
}

const BUILTIN = new Set(['PLATFORM', 'ADMIN', 'SETUP', 'GENERAL'])
const countPerm = (r: RoleRow, lvl: string) => Object.values(r.permissions ?? {}).filter((v) => v === lvl).length

const cols: GridColumn<RoleRow>[] = [
  { key: 'name', header: '역할', width: 120, code: true, render: (r) => r.name },
  { key: 'kind', header: '구분', width: 72, align: 'center', sortValue: (r) => (BUILTIN.has(r.name) ? 0 : 1), render: (r) => BUILTIN.has(r.name) ? <Chip tone="info">내장</Chip> : <Chip tone="ok">커스텀</Chip> },
  { key: 'desc', header: '설명', render: (r) => r.description || '—' },
  { key: 'write', header: 'WRITE', width: 64, align: 'right', sortValue: (r) => countPerm(r, 'WRITE'), render: (r) => countPerm(r, 'WRITE') },
  { key: 'read', header: 'READ', width: 64, align: 'right', sortValue: (r) => countPerm(r, 'READ'), render: (r) => countPerm(r, 'READ') },
]

export function RoleGrid({ rows }: { rows: RoleRow[] }) {
  return <DenseGrid prefKey="next-roles" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.name} emptyText="역할이 없습니다" />
}
