'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'

export interface HolidayRow { holidayId: number; date: string; name: string }

const cols: GridColumn<HolidayRow>[] = [
  { key: 'date', header: '일자', width: 120, align: 'center', code: true, render: (r) => r.date },
  { key: 'name', header: '공휴일명', render: (r) => r.name },
]

export function HolidayGrid({ rows }: { rows: HolidayRow[] }) {
  return <DenseGrid prefKey="next-holidays" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.holidayId} emptyText="공휴일이 없습니다" />
}
