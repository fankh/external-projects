'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface DrawingRow {
  drawingNo: string; name: string; type: string; kind: string; rev: string
  status: string; revCount: number; superseded: boolean
}

const cols: GridColumn<DrawingRow>[] = [
  { key: 'no', header: '도면번호', width: 120, code: true, render: (r) => r.drawingNo },
  { key: 'name', header: '도면명', render: (r) => r.name },
  { key: 'type', header: '유형', width: 72, align: 'center', render: (r) => r.type || '—' },
  { key: 'kind', header: '종류', width: 64, align: 'center', render: (r) => r.kind || '—' },
  { key: 'rev', header: 'Rev', width: 48, align: 'center', render: (r) => r.rev || '—' },
  { key: 'revs', header: '개정', width: 48, align: 'right', sortValue: (r) => r.revCount, render: (r) => r.revCount },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone="info">{r.status}</Chip> },
  { key: 'sup', header: '대체', width: 48, align: 'center', sortValue: (r) => (r.superseded ? 1 : 0), render: (r) => r.superseded ? <Chip tone="warn">대체</Chip> : '—' },
]

export function DrawingGrid({ rows, selectedNo }: { rows: DrawingRow[]; selectedNo?: string | null }) {
  const router = useRouter()
  return <DenseGrid prefKey="next-drawings" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.drawingNo} selectedKey={selectedNo ?? undefined}
    onRowClick={(r) => router.push(`/plm/drawings?no=${encodeURIComponent(r.drawingNo)}`)}
    emptyText="도면이 없습니다" />
}
