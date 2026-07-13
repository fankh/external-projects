'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface MaterialRow {
  code: string; name: string; materialType: string
  density: number | null; standard: string; hazard: string
}

const cols: GridColumn<MaterialRow>[] = [
  { key: 'code', header: '재질 코드', width: 120, code: true, render: (r) => r.code },
  { key: 'name', header: '재질명', render: (r) => r.name },
  { key: 'type', header: '유형', width: 90, align: 'center', sortValue: (r) => r.materialType, render: (r) => r.materialType || '—' },
  { key: 'density', header: '밀도', width: 72, align: 'right', sortValue: (r) => r.density ?? 0, render: (r) => r.density ?? '—' },
  { key: 'std', header: '규격', width: 100, render: (r) => r.standard || '—' },
  { key: 'hazard', header: '위험', width: 72, align: 'center', sortValue: (r) => r.hazard, render: (r) => r.hazard ? <Chip tone="warn">{r.hazard}</Chip> : '—' },
]

export function MaterialGrid({ rows }: { rows: MaterialRow[] }) {
  return <DenseGrid prefKey="next-materials" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.code} emptyText="재질이 없습니다" />
}
