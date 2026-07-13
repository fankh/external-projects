'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PartRow {
  partId: number; partNo: string; name: string; spec: string
  material: string | null; supplier: string | null; unit: string
  weight: number | null; isStandard: boolean; bomCount: number
}

const cols: GridColumn<PartRow>[] = [
  { key: 'no', header: '부품번호', width: 120, code: true, render: (r) => r.partNo },
  { key: 'name', header: '부품명', render: (r) => r.name },
  { key: 'spec', header: '사양', render: (r) => r.spec || '—' },
  { key: 'material', header: '재질', width: 90, render: (r) => r.material || '—' },
  { key: 'supplier', header: '공급처', width: 110, render: (r) => r.supplier || '—' },
  { key: 'unit', header: '단위', width: 48, align: 'center', render: (r) => r.unit },
  { key: 'weight', header: '중량', width: 64, align: 'right', sortValue: (r) => r.weight ?? 0, render: (r) => r.weight ?? '—' },
  { key: 'std', header: '표준', width: 48, align: 'center', sortValue: (r) => (r.isStandard ? 1 : 0), render: (r) => r.isStandard ? <Chip tone="ok">표준</Chip> : '—' },
  { key: 'bom', header: 'BOM', width: 48, align: 'right', sortValue: (r) => r.bomCount, render: (r) => r.bomCount },
]

export function PartGrid({ rows }: { rows: PartRow[] }) {
  return <DenseGrid prefKey="next-parts" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.partId} emptyText="부품이 없습니다" />
}
