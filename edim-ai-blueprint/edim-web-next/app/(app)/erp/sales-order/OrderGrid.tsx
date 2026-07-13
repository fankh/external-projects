'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface OrderRow {
  quotationNo: string; contractAmount: number; quoteAmount: number
  orderDate: string; expectedDelivery: string | null; project: string
  projectName: string; stage: string; customer: string
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

const cols: GridColumn<OrderRow>[] = [
  { key: 'no', header: '견적번호', width: 130, code: true, render: (r) => r.quotationNo },
  { key: 'proj', header: 'Project', width: 100, render: (r) => r.project },
  { key: 'cust', header: '고객', width: 100, render: (r) => r.customer || '—' },
  { key: 'quote', header: '견적액', width: 110, align: 'right', sortValue: (r) => r.quoteAmount, render: (r) => won(r.quoteAmount) },
  { key: 'contract', header: '계약액', width: 110, align: 'right', code: true, sortValue: (r) => r.contractAmount, render: (r) => won(r.contractAmount) },
  { key: 'order', header: '수주일', width: 96, align: 'center', render: (r) => r.orderDate || '—' },
  { key: 'exp', header: '예상납기', width: 96, align: 'center', render: (r) => r.expectedDelivery || '—' },
  { key: 'stage', header: '단계', width: 76, align: 'center', sortValue: (r) => r.stage, render: (r) => <Chip tone="ok">{r.stage}</Chip> },
]

export function OrderGrid({ rows }: { rows: OrderRow[] }) {
  return <DenseGrid prefKey="next-orders" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.quotationNo} emptyText="수주가 없습니다" />
}
