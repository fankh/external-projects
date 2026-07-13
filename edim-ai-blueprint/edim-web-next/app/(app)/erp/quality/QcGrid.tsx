'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface QcRow {
  inspNo: string; inspType: string; refNo: string; itemCode: string; itemName: string
  result: string; measured: string; inspector: string; inspectedAt: string
}

const cols: GridColumn<QcRow>[] = [
  { key: 'no', header: '검사번호', width: 110, code: true, render: (r) => r.inspNo },
  { key: 'type', header: '유형', width: 90, align: 'center', sortValue: (r) => r.inspType, render: (r) => r.inspType },
  { key: 'ref', header: '대상', width: 110, code: true, render: (r) => r.refNo || '—' },
  { key: 'item', header: '품목', render: (r) => r.itemName || r.itemCode || '—' },
  { key: 'result', header: '판정', width: 72, align: 'center', sortValue: (r) => r.result, render: (r) => <Chip tone={r.result === 'PASS' ? 'ok' : r.result === 'FAIL' ? 'err' : 'info'}>{r.result}</Chip> },
  { key: 'measured', header: '측정', width: 100, align: 'right', render: (r) => r.measured || '—' },
  { key: 'by', header: '검사자', width: 80, align: 'center', render: (r) => r.inspector || '—' },
  { key: 'at', header: '검사일시', width: 116, align: 'center', render: (r) => r.inspectedAt },
]

export function QcGrid({ rows }: { rows: QcRow[] }) {
  return <DenseGrid prefKey="next-qc" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.inspNo} emptyText="검사 기록이 없습니다" />
}
