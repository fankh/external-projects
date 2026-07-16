'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface AuditRow {
  at: string; target: string; action: string; by: string; login: string
  historyId: number
}

/** SSR 초기 rows → 클라이언트 DenseGrid(찾기·컬럼필터·정렬·페이지네이션 그대로). */
export function AuditGrid({ rows }: { rows: AuditRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<AuditRow>[] = [
    { key: 'at', header: t('audit.at', '일시'), width: 130, align: 'center', render: (r) => r.at },
    { key: 'action', header: t('audit.action', '작업'), width: 120, align: 'center', sortValue: (r) => r.action, render: (r) => <Chip tone="info">{r.action}</Chip> },
    { key: 'target', header: t('audit.target', '대상'), render: (r) => r.target },
    { key: 'by', header: t('audit.by', '수행자'), width: 90, align: 'center', render: (r) => r.by },
    { key: 'login', header: t('audit.login', '사번'), width: 80, align: 'center', render: (r) => r.login },
  ]
  return (
    <DenseGrid prefKey="next-audit" colFilter columns={cols} rows={rows}
      rowKey={(r) => r.historyId} emptyText={t('audit.noRows', '감사 기록이 없습니다')} />
  )
}
