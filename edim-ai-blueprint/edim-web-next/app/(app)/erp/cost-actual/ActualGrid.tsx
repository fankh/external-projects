'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'

export interface ActualRow {
  actualId: number; category: string; itemCode: string; itemName: string; poNo: string
  qty: number; unitPrice: number; amount: number; recordedAt: string; projectNo?: string
}

const CAT: Record<string, string> = { MATERIAL: '재료비', MANUFACTURING: '제조비', DIRECT: '직접경비' }
const won = (n: number) => `₩${Math.round(n).toLocaleString()}`

export function ActualGrid({ rows, searchActive }: { rows: ActualRow[]; searchActive?: boolean }) {
  const { t } = useI18n()
  const cols: GridColumn<ActualRow>[] = [
    { key: 'cat', header: t('act.cat', '분류'), width: 76, align: 'center', sortValue: (r) => r.category, render: (r) => CAT[r.category] ?? r.category },
    { key: 'item', header: t('act.item', '품목'), render: (r) => r.itemName || r.itemCode || '—' },
    { key: 'po', header: 'PO', width: 100, render: (r) => r.poNo || '—' },
    { key: 'qty', header: t('act.qty', '수량'), width: 56, align: 'right', sortValue: (r) => r.qty, render: (r) => r.qty },
    { key: 'up', header: t('act.unit', '단가'), width: 96, align: 'right', sortValue: (r) => r.unitPrice, render: (r) => won(r.unitPrice) },
    { key: 'amt', header: t('act.amt', '금액'), width: 110, align: 'right', code: true, sortValue: (r) => r.amount, render: (r) => won(r.amount) },
    { key: 'prj', header: t('act.proj', '프로젝트'), width: 90, align: 'center', render: (r) => r.projectNo || '—' },
    { key: 'at', header: t('act.at', '적재'), width: 92, align: 'center', render: (r) => r.recordedAt },
  ]
  return <DenseGrid prefKey="next-actual" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.actualId} emptyText={searchActive ? t('grid.noSearchResults', '검색 결과가 없습니다 — 검색어를 확인하십시오') : t('costact.empty', '실적이 없습니다 — 상단 폼으로 적재')} />
}
