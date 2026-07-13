'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface WarehouseRow {
  warehouseId: number; parentId: number | null; type: string; code: string; name: string
  hazard: boolean; inspection: boolean; remarks: string; depth: number; path: string
}

const cols: GridColumn<WarehouseRow>[] = [
  { key: 'code', header: '위치 코드', width: 130, code: true, render: (r) => <span style={{ paddingLeft: (r.depth ?? 0) * 12 }}>{r.code}</span> },
  { key: 'name', header: '위치명', render: (r) => r.name },
  { key: 'type', header: '유형', width: 90, align: 'center', sortValue: (r) => r.type, render: (r) => r.type || '—' },
  { key: 'hazard', header: '위험물', width: 60, align: 'center', sortValue: (r) => (r.hazard ? 1 : 0), render: (r) => r.hazard ? <Chip tone="warn">위험</Chip> : '—' },
  { key: 'insp', header: '검사', width: 56, align: 'center', sortValue: (r) => (r.inspection ? 1 : 0), render: (r) => r.inspection ? <Chip tone="info">검사</Chip> : '—' },
  { key: 'remarks', header: '비고', render: (r) => r.remarks || '—' },
]

export function WarehouseGrid({ rows }: { rows: WarehouseRow[] }) {
  return <DenseGrid prefKey="next-warehouses" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.warehouseId} emptyText="창고 위치가 없습니다" />
}
