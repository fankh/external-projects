'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface ProcRow { id: number; code: string; name: string; dept: string; auto: boolean }

export function ProcGrid({ rows }: { rows: ProcRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<ProcRow>[] = [
    { key: 'code', header: t('procset.code', '코드'), width: 72, align: 'center', code: true, render: (r) => r.code },
    { key: 'name', header: t('procset.processName', '프로세스'), render: (r) => r.name },
    { key: 'dept', header: t('dash.dept', '부서'), width: 100, align: 'center', sortValue: (r) => r.dept, render: (r) => r.dept },
    { key: 'auto', header: t('procset.auto', '자동'), width: 60, align: 'center', sortValue: (r) => (r.auto ? 1 : 0), render: (r) => r.auto ? <Chip tone="ok">{t('procset.auto', '자동')}</Chip> : <Chip tone="info">{t('procset.manual', '수동')}</Chip> },
  ]
  return <DenseGrid prefKey="next-procs" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.id} emptyText={t('procset.empty', '프로세스 정의가 없습니다')} />
}
