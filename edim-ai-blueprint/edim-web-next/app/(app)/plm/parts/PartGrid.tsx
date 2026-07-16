'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface PartRow {
  partId: number; partNo: string; name: string; spec: string
  material: string | null; supplier: string | null; unit: string
  weight: number | null; isStandard: boolean; bomCount: number
}

export function PartGrid({ rows, selectedNo }: { rows: PartRow[]; selectedNo?: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const cols: GridColumn<PartRow>[] = [
    { key: 'no', header: t('parts.partNo', '부품번호'), width: 120, code: true, render: (r) => r.partNo },
    { key: 'name', header: t('parts.partName', '부품명'), render: (r) => r.name },
    { key: 'spec', header: t('parts.specCol', '사양'), render: (r) => r.spec || '—' },
    { key: 'material', header: t('parts.materialCol', '재질'), width: 90, render: (r) => r.material || '—' },
    { key: 'supplier', header: t('parts.supplierCol', '공급처'), width: 110, render: (r) => r.supplier || '—' },
    { key: 'unit', header: t('parts.unitCol', '단위'), width: 48, align: 'center', render: (r) => r.unit },
    { key: 'weight', header: t('parts.weightCol', '중량'), width: 64, align: 'right', sortValue: (r) => r.weight ?? 0, render: (r) => r.weight ?? '—' },
    { key: 'std', header: t('parts.stdCol', '표준'), width: 48, align: 'center', sortValue: (r) => (r.isStandard ? 1 : 0), render: (r) => r.isStandard ? <Chip tone="ok">{t('parts.stdChip', '표준')}</Chip> : '—' },
    { key: 'bom', header: 'BOM', width: 48, align: 'right', sortValue: (r) => r.bomCount, render: (r) => r.bomCount },
  ]
  const sel = rows.find((r) => r.partNo === selectedNo)
  return <DenseGrid prefKey="next-parts" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.partId} selectedKey={sel?.partId}
    onRowClick={(r) => router.push(`/plm/parts?no=${encodeURIComponent(r.partNo)}`)}
    emptyText={t('parts.empty', '부품이 없습니다')} />
}
