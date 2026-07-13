'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface DocRow {
  docNo: string; title: string; person: string; date: string; status: string
  approver: string; appDate: string; version: string; grade: string; docType: string
}

const cols: GridColumn<DocRow>[] = [
  { key: 'no', header: '문서번호', width: 120, code: true, render: (r) => r.docNo },
  { key: 'title', header: '제목', render: (r) => r.title },
  { key: 'type', header: '유형', width: 84, align: 'center', sortValue: (r) => r.docType, render: (r) => r.docType || '—' },
  { key: 'ver', header: 'Ver', width: 52, align: 'center', render: (r) => r.version || '—' },
  { key: 'grade', header: 'Grade', width: 64, align: 'center', sortValue: (r) => r.grade, render: (r) => r.grade ? <Chip tone="warn">{r.grade}</Chip> : '—' },
  { key: 'status', header: '상태', width: 90, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'ACCEPTED' ? 'ok' : 'info'}>{r.status}</Chip> },
  { key: 'approver', header: '승인자', width: 80, align: 'center', render: (r) => r.approver || '—' },
  { key: 'appdate', header: '승인일', width: 96, align: 'center', render: (r) => r.appDate || '—' },
]

export function DocGrid({ rows }: { rows: DocRow[] }) {
  return <DenseGrid prefKey="next-docs" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.docNo} emptyText="문서가 없습니다" />
}
