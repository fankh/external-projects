'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface DrawingRow {
  drawingNo: string; name: string; type: string; kind: string; rev: string
  status: string; revCount: number; superseded: boolean
}

export function DrawingGrid({ rows, selectedNo, searchActive }: { rows: DrawingRow[]; selectedNo?: string | null; searchActive?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const cols: GridColumn<DrawingRow>[] = [
    { key: 'no', header: t('dwg.drawingNo', '도면번호'), width: 120, code: true, render: (r) => r.drawingNo },
    { key: 'name', header: t('dwg.drawingName', '도면명'), render: (r) => r.name },
    { key: 'type', header: t('dwg.typeCol', '유형'), width: 72, align: 'center', render: (r) => r.type || '—' },
    { key: 'kind', header: t('dwg.kindCol', '종류'), width: 64, align: 'center', render: (r) => r.kind || '—' },
    { key: 'rev', header: 'Rev', width: 48, align: 'center', render: (r) => r.rev || '—' },
    { key: 'revs', header: t('dwg.revCount', '개정'), width: 48, align: 'right', sortValue: (r) => r.revCount, render: (r) => r.revCount },
    { key: 'status', header: t('dwg.statusCol', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone="info">{r.status}</Chip> },
    { key: 'sup', header: t('dwg.superseded', '대체'), width: 48, align: 'center', sortValue: (r) => (r.superseded ? 1 : 0), render: (r) => r.superseded ? <Chip tone="warn">{t('dwg.superseded', '대체')}</Chip> : '—' },
  ]
  return <DenseGrid prefKey="next-drawings" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.drawingNo} selectedKey={selectedNo ?? undefined}
    onRowClick={(r) => router.push(`/plm/drawings?no=${encodeURIComponent(r.drawingNo)}`)}
    emptyText={searchActive ? t('grid.noSearchResults', '검색 결과가 없습니다 — 검색어를 확인하십시오') : t('dwg.empty', '도면이 없습니다')} />
}
