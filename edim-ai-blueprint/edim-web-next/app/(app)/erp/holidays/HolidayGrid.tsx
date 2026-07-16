'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Btn } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { deleteHoliday } from './actions'

export interface HolidayRow { holidayId: number; date: string; name: string }

export function HolidayGrid({ rows }: { rows: HolidayRow[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()

  const onDelete = (id: number) => {
    if (!confirm(t('cal.confirmDelete', '이 공휴일을 삭제하시겠습니까?'))) return
    start(async () => { await deleteHoliday(id); router.refresh() })
  }

  const cols: GridColumn<HolidayRow>[] = [
    { key: 'date', header: t('cal.dateCol', '일자'), width: 120, align: 'center', code: true, render: (r) => r.date },
    { key: 'name', header: t('cal.name', '공휴일명'), render: (r) => r.name },
    { key: 'act', header: '', width: 56, align: 'center', noSort: true, noFilter: true, render: (r) => <Btn style={{ height: 18, fontSize: 9.5 }} disabled={pending} onClick={() => onDelete(r.holidayId)}>{t('cal.delete', '삭제')}</Btn> },
  ]

  return <DenseGrid prefKey="next-holidays" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.holidayId} emptyText={t('cal.empty', '공휴일이 없습니다')} />
}
