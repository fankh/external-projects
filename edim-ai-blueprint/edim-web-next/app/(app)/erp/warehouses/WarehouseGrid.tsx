'use client'

/** 창고·저장위치 — 계층 등록/삭제 액션 (N3 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { createWarehouse, deleteWarehouse, type ActState } from './actions'

export interface WarehouseRow {
  warehouseId: number; parentId: number | null; type: string; code: string; name: string
  hazard: boolean; inspection: boolean; remarks: string; depth: number; path: string
}

const TYPES = ['REGION', 'PLANT', 'WAREHOUSE', 'STORAGE', 'SECTOR']

export function WarehouseGrid({ rows }: { rows: WarehouseRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<WarehouseRow>[] = [
    { key: 'code', header: t('wh.locCodeCol', '위치 코드'), width: 130, code: true, render: (r) => <span style={{ paddingLeft: (r.depth ?? 0) * 12 }}>{r.code}</span> },
    { key: 'name', header: t('wh.name', '위치명'), render: (r) => r.name },
    { key: 'type', header: t('wh.typeCol', '유형'), width: 90, align: 'center', sortValue: (r) => r.type, render: (r) => r.type || '—' },
    { key: 'hazard', header: t('wh.hazardShort', '위험물'), width: 60, align: 'center', sortValue: (r) => (r.hazard ? 1 : 0), render: (r) => r.hazard ? <Chip tone="warn">{t('wh.hazardChip', '위험')}</Chip> : '—' },
    { key: 'insp', header: t('wh.inspShort', '검사'), width: 56, align: 'center', sortValue: (r) => (r.inspection ? 1 : 0), render: (r) => r.inspection ? <Chip tone="info">{t('wh.inspChip', '검사')}</Chip> : '—' },
    { key: 'remarks', header: t('wh.remarks', '비고'), render: (r) => r.remarks || '—' },
  ]
  const [regSt, regAction, regPending] = useActionState(createWarehouse, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.warehouseId === selId) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal trigger={t('wh.addLoc', '＋ 위치 등록')} title={t('wh.regTitle', '위치 등록')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('wh.parentCode', '상위 코드')}</label>
              <input className="in" name="parentCode" placeholder={t('wh.parentPh', '상위 코드 (없음=최상위)')} defaultValue={sel?.code ?? ''} key={sel?.code ?? 'root'} />
              <label>{t('wh.typeCol', '유형')}</label>
              <select className="in" name="locationType" defaultValue="REGION">
                {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
              <label>{t('wh.locCodeCol', '위치 코드')}</label>
              <input className="in req" name="code" autoFocus />
              <label>{t('wh.name', '위치명')}</label>
              <input className="in req" name="name" />
              <label>{t('wh.remarks', '비고')}</label>
              <input className="in" name="remarks" />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
        <span className="sep" />
        <button className="b" disabled={pending || !sel} onClick={(e) => {
          e.preventDefault()
          if (!sel) return
          if (confirm(`${sel.code} 를 삭제하시겠습니까? (하위 존재 시 거부)`))
            start(async () => { setSt(await deleteWarehouse(sel.code)); setSelId(null) })
        }}>{t('wh.deleteBtn', '삭제')}{sel ? ` (${sel.code})` : ''}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-warehouses" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.warehouseId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.warehouseId)} emptyText={t('wh.empty', '창고 위치가 없습니다')} />
      </div>
    </div>
  )
}
