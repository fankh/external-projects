'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'

export interface StockRow {
  itemCode: string; itemName: string; locationCode: string; locationName: string
  quantity: number; unit: string; updatedAt: string; unitPrice?: number; value?: number
}

const won = (n: number) => `₩${Math.round(n).toLocaleString()}`

const cols: GridColumn<StockRow>[] = [
  { key: 'code', header: '품목', width: 110, code: true, render: (r) => r.itemCode },
  { key: 'name', header: '품명', render: (r) => r.itemName || '—' },
  { key: 'loc', header: '위치', width: 110, render: (r) => r.locationName || r.locationCode },
  { key: 'qty', header: '수량', width: 72, align: 'right', sortValue: (r) => r.quantity, render: (r) => `${r.quantity} ${r.unit}` },
  { key: 'price', header: '단가', width: 84, align: 'right', sortValue: (r) => r.unitPrice ?? 0, render: (r) => won(r.unitPrice ?? 0) },
  { key: 'value', header: '평가액', width: 100, align: 'right', code: true, sortValue: (r) => r.value ?? 0, render: (r) => won(r.value ?? 0) },
  { key: 'upd', header: '갱신', width: 116, align: 'center', render: (r) => r.updatedAt },
]

export function StockGrid({ rows }: { rows: StockRow[] }) {
  return <DenseGrid prefKey="next-stock" colFilter columns={cols} rows={rows}
    rowKey={(r) => `${r.itemCode}@${r.locationCode}`} emptyText="재고가 없습니다 — 입고 처리하면 표시됩니다" />
}
