'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PoRow {
  poNo: string; supplier: string; status: string; statusLabel: string
  orderDate: string; expectedDate: string | null; lines: number; amount: number
  orderQty: number; receivedQty: number; progress: number; matched: boolean
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

const cols: GridColumn<PoRow>[] = [
  { key: 'no', header: '발주번호', width: 120, code: true, render: (r) => r.poNo },
  { key: 'supplier', header: '공급처', width: 120, render: (r) => r.supplier || '—' },
  { key: 'status', header: '상태', width: 90, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone="info">{r.statusLabel || r.status}</Chip> },
  { key: 'order', header: '발주일', width: 96, align: 'center', render: (r) => r.orderDate },
  { key: 'exp', header: '예정일', width: 96, align: 'center', render: (r) => r.expectedDate || '—' },
  { key: 'lines', header: '품목', width: 48, align: 'right', sortValue: (r) => r.lines, render: (r) => r.lines },
  { key: 'amount', header: '금액', width: 120, align: 'right', sortValue: (r) => r.amount, render: (r) => won(r.amount) },
  { key: 'prog', header: '입고율', width: 64, align: 'right', sortValue: (r) => r.progress, render: (r) => `${Math.round(r.progress)}%` },
]

export function PoGrid({ rows }: { rows: PoRow[] }) {
  return <DenseGrid prefKey="next-po" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.poNo} emptyText="발주가 없습니다" />
}
