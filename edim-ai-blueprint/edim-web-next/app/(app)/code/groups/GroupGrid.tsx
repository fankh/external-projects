'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface GroupRow {
  groupCode: string; groupName: string; groupType: string
  hierarchyAddress: string; status: string; slotCount: number
}

export function GroupGrid({ rows }: { rows: GroupRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<GroupRow>[] = [
    { key: 'code', header: t('hier.groupCode', '그룹 코드'), width: 110, code: true, render: (r) => r.groupCode },
    { key: 'name', header: t('hier.groupName', '그룹명'), render: (r) => r.groupName },
    { key: 'type', header: t('hier.groupType', '유형'), width: 90, align: 'center', sortValue: (r) => r.groupType, render: (r) => r.groupType || '—' },
    { key: 'addr', header: t('hier.address', '계층 주소'), width: 120, code: true, render: (r) => r.hierarchyAddress || '—' },
    { key: 'slots', header: 'Slot', width: 56, align: 'right', sortValue: (r) => r.slotCount, render: (r) => r.slotCount },
    { key: 'status', header: t('hier.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'info'}>{r.status}</Chip> },
  ]
  return <DenseGrid prefKey="next-groups" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.groupCode} emptyText={t('hier.emptyGroups', '코드 그룹이 없습니다')} />
}
