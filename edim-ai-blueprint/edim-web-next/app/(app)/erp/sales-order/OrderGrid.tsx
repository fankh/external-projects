'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface OrderRow {
  quotationNo: string; contractAmount: number; quoteAmount: number
  orderDate: string; expectedDelivery: string | null; project: string
  projectName: string; stage: string; customer: string
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

export function OrderGrid({ rows }: { rows: OrderRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<OrderRow>[] = [
    { key: 'no', header: t('order.quoteNo', '견적번호'), width: 130, code: true, render: (r) => r.quotationNo },
    { key: 'proj', header: 'Project', width: 100, render: (r) => r.project },
    { key: 'cust', header: t('order.customer', '고객'), width: 100, render: (r) => r.customer || '—' },
    { key: 'quote', header: t('so.quoteAmount', '견적액'), width: 110, align: 'right', sortValue: (r) => r.quoteAmount, render: (r) => won(r.quoteAmount) },
    { key: 'contract', header: t('so.contractAmount', '계약액'), width: 110, align: 'right', code: true, sortValue: (r) => r.contractAmount, render: (r) => won(r.contractAmount) },
    { key: 'order', header: t('order.orderDate', '수주일'), width: 96, align: 'center', render: (r) => r.orderDate || '—' },
    { key: 'exp', header: t('so.expDelivery', '예상납기'), width: 96, align: 'center', render: (r) => r.expectedDelivery || '—' },
    { key: 'stage', header: t('order.stage', '단계'), width: 76, align: 'center', sortValue: (r) => r.stage, render: (r) => <Chip tone="ok">{r.stage}</Chip> },
  ]
  return <DenseGrid prefKey="next-orders" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.quotationNo} emptyText={t('so.emptyOrders', '수주가 없습니다')} />
}
