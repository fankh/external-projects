'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface AuditRow {
  at: string; target: string; action: string; by: string; login: string
  historyId: number
}

const cols: GridColumn<AuditRow>[] = [
  { key: 'at', header: '일시', width: 130, align: 'center', render: (r) => r.at },
  { key: 'action', header: '작업', width: 120, align: 'center', sortValue: (r) => r.action, render: (r) => <Chip tone="info">{r.action}</Chip> },
  { key: 'target', header: '대상', render: (r) => r.target },
  { key: 'by', header: '수행자', width: 90, align: 'center', render: (r) => r.by },
  { key: 'login', header: '사번', width: 80, align: 'center', render: (r) => r.login },
]

/** SSR 초기 rows → 클라이언트 DenseGrid(찾기·컬럼필터·정렬·페이지네이션 그대로). */
export function AuditGrid({ rows }: { rows: AuditRow[] }) {
  return (
    <DenseGrid prefKey="next-audit" colFilter columns={cols} rows={rows}
      rowKey={(r) => r.historyId} emptyText="감사 기록이 없습니다" />
  )
}
