'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface ApprovalRow {
  id: number; assetType: string; target: string; reqKind: string
  requester: string; reqDate: string; stage: string; tested: boolean; requesterLogin: string
}

const cols: GridColumn<ApprovalRow>[] = [
  { key: 'asset', header: '자산유형', width: 90, align: 'center', sortValue: (r) => r.assetType, render: (r) => r.assetType },
  { key: 'target', header: '대상', width: 130, code: true, render: (r) => r.target },
  { key: 'kind', header: '구분', width: 90, align: 'center', render: (r) => r.reqKind },
  { key: 'stage', header: '단계', width: 80, align: 'center', render: (r) => r.stage },
  { key: 'requester', header: '요청자', width: 90, align: 'center', render: (r) => r.requester },
  { key: 'date', header: '요청일', width: 96, align: 'center', render: (r) => r.reqDate },
  { key: 'tested', header: 'Test', width: 60, align: 'center', sortValue: (r) => (r.tested ? 1 : 0), render: (r) => r.tested ? <Chip tone="ok">통과</Chip> : <Chip tone="warn">미통과</Chip> },
]

export function ApprovalGrid({ rows }: { rows: ApprovalRow[] }) {
  return <DenseGrid prefKey="next-approval" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.id} emptyText="대기 중인 승인 요청이 없습니다" />
}
