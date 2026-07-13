'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PcRow {
  productCodeId: number; mainCode: string; codeName: string; groupCode: string
  status: string; createdAt: string; refs: number
}

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { APPROVED: 'ok', DRAFT: 'info', INACTIVE: 'warn' }

const cols: GridColumn<PcRow>[] = [
  { key: 'code', header: '코드', width: 130, code: true, render: (r) => r.mainCode },
  { key: 'name', header: '코드명', render: (r) => r.codeName },
  { key: 'group', header: '그룹', width: 90, align: 'center', render: (r) => r.groupCode },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip> },
  { key: 'refs', header: '참조', width: 50, align: 'right', sortValue: (r) => r.refs, render: (r) => r.refs },
  { key: 'at', header: '등록일', width: 96, align: 'center', render: (r) => r.createdAt },
]

export function PcGrid({ rows }: { rows: PcRow[] }) {
  return <DenseGrid prefKey="next-pc" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.productCodeId} emptyText="제품 코드가 없습니다" />
}
