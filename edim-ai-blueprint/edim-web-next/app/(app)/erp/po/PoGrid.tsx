'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface PoRow {
  poNo: string; supplier: string; status: string; statusLabel: string
  orderDate: string; expectedDate: string | null; lines: number; amount: number
  orderQty: number; receivedQty: number; progress: number; matched: boolean
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

export function PoGrid({ rows, selectedNo, searchActive }: { rows: PoRow[]; selectedNo?: string | null; searchActive?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const cols: GridColumn<PoRow>[] = [
    { key: 'no', header: t('po.poNo', '발주번호'), width: 120, code: true, render: (r) => r.poNo },
    { key: 'supplier', header: t('po.supplier', '공급처'), width: 120, render: (r) => r.supplier || '—' },
    { key: 'status', header: t('po.status', '상태'), width: 90, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'DONE' ? 'ok' : r.status === 'DRAFT' ? 'info' : 'warn'}>{r.statusLabel || r.status}</Chip> },
    { key: 'order', header: t('po.orderDate', '발주일'), width: 96, align: 'center', render: (r) => r.orderDate },
    { key: 'exp', header: t('po.expected', '예정일'), width: 96, align: 'center', render: (r) => r.expectedDate || '—' },
    { key: 'lines', header: t('po.item', '품목'), width: 48, align: 'right', sortValue: (r) => r.lines, render: (r) => r.lines },
    { key: 'amount', header: t('po.amount', '금액'), width: 120, align: 'right', sortValue: (r) => r.amount, render: (r) => won(r.amount) },
    { key: 'prog', header: t('po.receiveRate', '입고율'), width: 64, align: 'right', sortValue: (r) => r.progress, render: (r) => `${Math.round(r.progress)}%` },
  ]
  return <DenseGrid prefKey="next-po" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.poNo} selectedKey={selectedNo ?? undefined}
    onRowClick={(r) => router.push(`/erp/po?no=${encodeURIComponent(r.poNo)}`)}
    emptyText={searchActive ? t('grid.noSearchResults', '검색 결과가 없습니다 — 검색어를 확인하십시오') : t('po.emptyList', '발주가 없습니다')} />
}
