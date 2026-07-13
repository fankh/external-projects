'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface CodeValueRow { slot: string; itemName: string; valueCode: string; valueName: string; status: string; valueId?: number }

const cols: GridColumn<CodeValueRow>[] = [
  { key: 'slot', header: 'Slot', width: 64, align: 'center', code: true, render: (r) => r.slot },
  { key: 'itemName', header: '항목명', width: 160, render: (r) => r.itemName },
  { key: 'valueCode', header: '값 코드', width: 100, code: true, render: (r) => r.valueCode },
  { key: 'valueName', header: '값 이름', render: (r) => r.valueName || '—' },
  { key: 'status', header: '상태', width: 96, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'DEPRECATED' ? 'warn' : 'ok'}>{r.status}</Chip> },
]

export function VariantGrid({ rows, group }: { rows: CodeValueRow[]; group: string }) {
  const router = useRouter()
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>그룹</label>
        <input className="in" defaultValue={group} style={{ height: 22, fontSize: 11, width: 100 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/variant?group=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>Enter 로 그룹 전환 · 배리언트 상수값</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey={`next-variant-${group}`} colFilter columns={cols} rows={rows}
          rowKey={(r, i) => r.valueId ?? `${r.slot}-${r.valueCode}-${i}`} emptyText="정의된 상수값이 없습니다" />
      </div>
    </div>
  )
}
