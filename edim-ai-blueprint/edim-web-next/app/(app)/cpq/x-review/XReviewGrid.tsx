'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'

export interface XRow {
  selectionId: number; finishedGoodsCode: string; slotValues: Record<string, string>
  projectNo: string; projectName: string; createdAt: string; createdBy: string
}

const cols: GridColumn<XRow>[] = [
  { key: 'code', header: 'X-code', width: 130, code: true, render: (r) => r.finishedGoodsCode },
  { key: 'proj', header: '프로젝트', width: 110, render: (r) => r.projectNo },
  { key: 'pname', header: '프로젝트명', render: (r) => r.projectName || '—' },
  { key: 'slots', header: '구성(슬롯)', render: (r) => Object.entries(r.slotValues || {}).map(([k, v]) => `${k}=${v}`).join(' · ') || '—' },
  { key: 'by', header: '요청자', width: 70, align: 'center', render: (r) => r.createdBy },
  { key: 'at', header: '요청일시', width: 130, align: 'center', render: (r) => r.createdAt },
]

export function XReviewGrid({ rows }: { rows: XRow[] }) {
  return <DenseGrid prefKey="next-xreview" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.selectionId} emptyText="검토 대기 중인 X-code 가 없습니다" />
}
