'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { deletePart, type ActState } from './actions'

export interface PartRow {
  partId: number; partNo: string; name: string; spec: string
  material: string | null; supplier: string | null; unit: string
  weight: number | null; isStandard: boolean; bomCount: number
}

export function PartGrid({ rows, selectedNo }: { rows: PartRow[]; selectedNo?: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [st, setSt] = useState<ActState>({})
  const [optSel, setOptSel] = useState<number | null>(null)   // 낙관적 선택(SSR 왕복 전 즉시 하이라이트)
  const [, start] = useTransition()
  const select = (r: PartRow) => { setOptSel(r.partId); router.push(`/plm/parts?no=${encodeURIComponent(r.partNo)}`) }
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
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {st.error || st.ok ? (
        <div style={{ padding: '2px 6px', fontSize: 11, color: st.error ? 'var(--err)' : 'var(--run)' }}>{st.error ?? st.ok}</div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-parts" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.partId} selectedKey={optSel ?? sel?.partId}
          onRowClick={select}
          rowActions={(r) => [
            { label: t('grid.rowSelect', '선택'), onClick: () => select(r) },
            {
              label: t('common.delete', '삭제'), danger: true, onClick: () => {
                if (confirm(`${r.partNo} 부품을 삭제하시겠습니까? (BOM 참조 시 거부)`))
                  start(async () => setSt(await deletePart(r.partNo)))
              },
            },
          ]}
          emptyText={t('parts.empty', '부품이 없습니다')} />
      </div>
    </div>
  )
}
