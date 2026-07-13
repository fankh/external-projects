'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface SlotRow {
  slot: string; label: string; values: string; allValues: string
  count: number; status: string; approved: boolean
}

const cols: GridColumn<SlotRow>[] = [
  { key: 'slot', header: 'Slot', width: 64, align: 'center', code: true, render: (r) => r.slot },
  { key: 'label', header: '항목명', render: (r) => r.label },
  { key: 'values', header: '값', render: (r) => r.values || '—' },
  { key: 'count', header: '개수', width: 56, align: 'right', sortValue: (r) => r.count, render: (r) => r.count },
  { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.approved ? 'ok' : 'info'}>{r.status}</Chip> },
]

export function SlotGrid({ rows, group }: { rows: SlotRow[]; group: string }) {
  const router = useRouter()
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>그룹</label>
        <input className="in" defaultValue={group} style={{ height: 22, fontSize: 11, width: 100 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/subcode?group=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>Enter 로 그룹 전환</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-slots" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.slot} emptyText="Slot 이 없습니다" />
      </div>
    </div>
  )
}
