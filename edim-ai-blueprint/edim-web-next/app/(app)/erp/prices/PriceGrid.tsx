'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PriceRow {
  priceId?: number; code: string; name: string; supplier: string
  price: number; source: string; from: string; to: string | null; active: boolean
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

const cols: GridColumn<PriceRow>[] = [
  { key: 'code', header: '코드', width: 120, code: true, render: (r) => r.code },
  { key: 'name', header: '품명', render: (r) => r.name },
  { key: 'supplier', header: '공급처', width: 110, render: (r) => r.supplier || '—' },
  { key: 'price', header: '단가', width: 110, align: 'right', sortValue: (r) => r.price, render: (r) => won(r.price) },
  { key: 'source', header: '구분', width: 78, align: 'center', sortValue: (r) => r.source, render: (r) => <Chip tone="info">{r.source}</Chip> },
  { key: 'from', header: '유효 시작', width: 96, align: 'center', render: (r) => r.from },
  { key: 'to', header: '유효 종료', width: 96, align: 'center', render: (r) => r.to || '—' },
  { key: 'active', header: '상태', width: 58, align: 'center', sortValue: (r) => (r.active ? 1 : 0), render: (r) => r.active ? <Chip tone="ok">유효</Chip> : <Chip tone="warn">종료</Chip> },
]

export function PriceGrid({ rows }: { rows: PriceRow[] }) {
  return <DenseGrid prefKey="next-prices" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.priceId ?? `${r.code}-${r.from}`} emptyText="단가가 없습니다" />
}
