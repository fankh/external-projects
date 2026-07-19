'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { deletePart, updatePart, type ActState } from './actions'

export interface PartRow {
  partId: number; partNo: string; name: string; spec: string
  material: string | null; supplier: string | null; unit: string
  weight: number | null; isStandard: boolean; bomCount: number
}

export function PartGrid({ rows, selectedNo }: { rows: PartRow[]; selectedNo?: string | null }) {
  const { t } = useI18n()
  const perm = usePermission()
  const router = useRouter()
  const [st, setSt] = useState<ActState>({})
  const [optSel, setOptSel] = useState<number | null>(null)   // 낙관적 선택(SSR 왕복 전 즉시 하이라이트)
  const [, start] = useTransition()
  // F5 이식 — 더블클릭 수정 다이얼로그 (?no= RSC 네비가 폼 액션을 무효화 → 클릭/더블클릭 판별)
  const [edit, setEdit] = useState<PartRow | null>(null)
  const [editSt, editAction, editPending] = useActionState(updatePart, {} as ActState)
  useEffect(() => { if (editSt.ok) setEdit(null) }, [editSt.ok])
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const select = (r: PartRow) => { setOptSel(r.partId); router.push(`/plm/parts?no=${encodeURIComponent(r.partNo)}`) }
  const rowClick = (r: PartRow) => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => select(r), 260)
  }
  const rowDblClick = (r: PartRow) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (perm.canWrite('plm-parts')) setEdit(r)
    else setSt({ error: perm.denyWrite })
  }
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
      {st.error || st.ok || editSt.ok ? (
        <div style={{ padding: '2px 6px', fontSize: 11, color: st.error ? 'var(--err)' : 'var(--run)' }}>{st.error ?? st.ok ?? editSt.ok}</div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-parts" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.partId} selectedKey={optSel ?? sel?.partId}
          onRowClick={rowClick}
          onRowDoubleClick={rowDblClick}
          rowActions={(r) => [
            { label: t('grid.rowSelect', '선택'), onClick: () => select(r) },
            { label: t('raw.editBtn', '수정'), onClick: () => rowDblClick(r) },
            {
              label: t('common.delete', '삭제'), danger: true, onClick: () => {
                if (confirm(`${r.partNo} 부품을 삭제하시겠습니까? (BOM 참조 시 거부)`))
                  start(async () => setSt(await deletePart(r.partNo)))
              },
            },
          ]}
          emptyText={t('parts.empty', '부품이 없습니다')} />
      </div>
      {/* F5 이식 — 부품 수정 다이얼로그 (부품명·사양·재질·공급처·단위·중량) */}
      {edit ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEdit(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEdit(null) }}>
          <form action={editAction} className="gb" data-part-edit key={edit.partId}
            style={{ width: 340, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('parts.editTitle', '부품 수정')} — {edit.partNo}</div>
            <input type="hidden" name="partNo" value={edit.partNo} />
            <div className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('parts.partName', '부품명')}</label>
              <input className="in req" name="name" aria-label="수정 부품명" defaultValue={edit.name} autoFocus />
              <label>{t('parts.specCol', '사양')}</label>
              <input className="in" name="spec" defaultValue={edit.spec || ''} />
              <label>{t('parts.materialCol', '재질')}</label>
              <input className="in" name="materialCode" defaultValue={edit.material || ''} />
              <label>{t('parts.supplierCol', '공급처')}</label>
              <input className="in" name="supplier" defaultValue={edit.supplier || ''} />
              <label>{t('parts.unitCol', '단위')}</label>
              <input className="in" name="unit" defaultValue={edit.unit || 'EA'} />
              <label>{t('parts.weightCol', '중량')}</label>
              <input className="in" name="weight" aria-label="수정 중량" defaultValue={edit.weight ?? ''} />
            </div>
            {editSt.error ? <div style={{ color: 'var(--err)' }}>{editSt.error}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="b" type="button" onClick={() => setEdit(null)}>{t('common.cancel', '취소')}</button>
              <button className="b pri" type="submit" disabled={editPending}>{t('common.save', '저장')}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
