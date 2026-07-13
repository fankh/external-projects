'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'

export interface TableRow { key: string; values: Record<string, string | number | null> }

/** 동적 컬럼 그리드 — columns(string[]) 로 GridColumn 을 런타임 생성. */
export function DataTableGrid({ name, columns, rows }: { name: string; columns: string[]; rows: TableRow[] }) {
  const router = useRouter()
  const cols: GridColumn<TableRow>[] = [
    { key: '__key', header: 'Key', width: 80, align: 'center', code: true, sortValue: (r) => r.key, render: (r) => r.key },
    ...columns.map((c) => ({
      key: c, header: c, align: 'right' as const,
      sortValue: (r: TableRow) => { const v = r.values[c]; return typeof v === 'number' ? v : (v ?? '') },
      render: (r: TableRow) => { const v = r.values[c]; return v == null || v === '' ? '—' : String(v) },
    })),
  ]
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>Table</label>
        <input className="in" defaultValue={name} style={{ height: 22, fontSize: 11, width: 120 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/datatable?name=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{columns.length} 컬럼 · Enter 로 테이블 전환</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey={`next-table-${name}`} colFilter columns={cols} rows={rows}
          rowKey={(r) => r.key} emptyText="데이터 행이 없습니다" />
      </div>
    </div>
  )
}
