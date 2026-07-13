'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PrRow {
  code: string; name: string; supplierCode: string; supplier: string
  qty: number; onHand: number; reserved: number; available: number
  price: number | null; requiredDate: string
}

const won = (n: number | null) => (n == null ? '—' : `₩ ${Math.round(n).toLocaleString()}`)

const cols: GridColumn<PrRow>[] = [
  { key: 'code', header: '코드', width: 110, code: true, render: (r) => r.code },
  { key: 'name', header: '품명', render: (r) => r.name },
  { key: 'supplier', header: '공급처', width: 110, render: (r) => r.supplier || '—' },
  { key: 'qty', header: '소요', width: 56, align: 'right', sortValue: (r) => r.qty, render: (r) => r.qty },
  { key: 'onhand', header: '보유', width: 56, align: 'right', sortValue: (r) => r.onHand, render: (r) => r.onHand },
  { key: 'avail', header: '가용', width: 56, align: 'right', sortValue: (r) => r.available, render: (r) => <b style={{ color: r.available >= r.qty ? 'var(--ok)' : 'var(--err)' }}>{r.available}</b> },
  { key: 'price', header: '단가', width: 100, align: 'right', sortValue: (r) => r.price ?? 0, render: (r) => won(r.price) },
  { key: 'req', header: '소요일', width: 72, align: 'center', render: (r) => r.requiredDate || '—' },
  { key: 'stock', header: '재고판정', width: 76, align: 'center', sortValue: (r) => (r.available >= r.qty ? 1 : 0), render: (r) => r.available >= r.qty ? <Chip tone="ok">충족</Chip> : <Chip tone="warn">발주</Chip> },
]

export function PrGrid({ rows }: { rows: PrRow[] }) {
  return <DenseGrid prefKey="next-pr" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.code} emptyText="발주 요청 품목이 없습니다" />
}
