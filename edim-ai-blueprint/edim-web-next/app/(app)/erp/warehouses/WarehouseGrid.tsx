'use client'

/** 창고·저장위치 — 계층 등록/삭제 + 정기점검 실적 (N3·U5). */
import { useActionState, useEffect, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { addInspection, createWarehouse, deleteWarehouse, listInspections, updateWarehouse, type ActState, type InspectionRow } from './actions'

export interface WarehouseRow {
  warehouseId: number; parentId: number | null; type: string; code: string; name: string
  hazard: boolean; inspection: boolean; remarks: string; depth: number; path: string
}

const TYPES = ['REGION', 'PLANT', 'WAREHOUSE', 'STORAGE', 'SECTOR']

export function WarehouseGrid({ rows }: { rows: WarehouseRow[] }) {
  const { t } = useI18n()
  const perm = usePermission()
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
  // F5 이식 — 수정 다이얼로그 (위치명·비고·위험물·검사주기)
  const [edit, setEdit] = useState<WarehouseRow | null>(null)
  const [editSt, editAction, editPending] = useActionState(updateWarehouse, {} as ActState)
  useEffect(() => { if (editSt.ok) setEdit(null) }, [editSt.ok])

  // ── U5 정기점검 실적 — 선택 위치의 점검 이력 + 등록 ──
  const [inspections, setInspections] = useState<InspectionRow[]>([])
  const [inspResult, setInspResult] = useState<'OK' | 'ISSUE'>('OK')
  const [inspNote, setInspNote] = useState('')
  const [inspSt, setInspSt] = useState<ActState>({})
  useEffect(() => {
    if (!sel) { setInspections([]); return }
    let alive = true
    void listInspections(sel.code).then((r) => { if (alive) setInspections(r) })
    return () => { alive = false }
  }, [sel?.code])  // eslint-disable-line react-hooks/exhaustive-deps
  const submitInspection = () => start(async () => {
    if (!sel) return
    const r = await addInspection(sel.code, inspResult, inspNote)
    setInspSt(r)
    if (r.ok) { setInspNote(''); setInspections(await listInspections(sel.code)) }
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal disabled={!perm.canWrite('erp-warehouse')} disabledTitle={perm.denyWrite}
          trigger={t('wh.addLoc', '＋ 위치 등록')} title={t('wh.regTitle', '위치 등록')} ok={regSt.ok}>
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
        <button className="b" data-wh-edit-open disabled={!sel || !perm.canWrite('erp-warehouse')}
          title={perm.canWrite('erp-warehouse') ? undefined : perm.denyWrite}
          onClick={() => sel && setEdit(sel)}>{t('raw.editBtn', '수정')}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
        {editSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{editSt.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DenseGrid prefKey="next-warehouses" colFilter columns={cols} rows={rows}
            rowKey={(r) => r.warehouseId} selectedKey={selId ?? undefined}
            onRowClick={(r) => setSelId(r.warehouseId)} emptyText={t('wh.empty', '창고 위치가 없습니다')} />
        </div>
        {sel ? (
          <div className="gb" data-inspection-panel style={{ width: 300, overflow: 'auto', padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('wh.inspTitle', '정기점검 실적')} — {sel.code} ({inspections.length})</div>
            <table className="g" style={{ width: '100%' }}>
              <thead><tr><th>{t('wh.inspResult', '판정')}</th><th>{t('wh.remarks', '비고')}</th><th>{t('wh.inspBy', '점검자')}</th><th>{t('wh.inspAt', '일시')}</th></tr></thead>
              <tbody>{inspections.length ? inspections.map((i) => (
                <tr key={i.id}><td className="c"><Chip tone={i.result === 'OK' ? 'ok' : 'err'}>{i.result}</Chip></td>
                  <td>{i.note || '—'}</td><td className="c">{i.by}</td><td className="c" style={{ fontSize: 9.5 }}>{i.at}</td></tr>
              )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('wh.noInsp', '점검 기록 없음')}</td></tr>}</tbody>
            </table>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
              <select className="in" value={inspResult} onChange={(e) => setInspResult(e.target.value as 'OK' | 'ISSUE')} style={{ height: 20, fontSize: 10.5 }}>
                <option value="OK">OK</option><option value="ISSUE">ISSUE</option>
              </select>
              <input className="in" style={{ flex: 1, minWidth: 90 }} placeholder={t('wh.inspNotePh', '점검 비고')} value={inspNote} onChange={(e) => setInspNote(e.target.value)} />
              <button className="b run" data-insp-add disabled={pending} onClick={submitInspection}>＋ {t('wh.inspAdd', '점검 기록')}</button>
              {inspSt.error ? <span style={{ color: 'var(--err)', fontSize: 10 }}>{inspSt.error}</span> : null}
              {inspSt.ok ? <span style={{ color: 'var(--run)', fontSize: 10 }}>{inspSt.ok}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
      {/* F5 이식 — 창고 수정 다이얼로그 (code 불변, PATCH) */}
      {edit ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEdit(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEdit(null) }}>
          <form action={editAction} className="gb" data-wh-edit key={edit.warehouseId}
            style={{ width: 320, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('wh.editTitle', '위치 수정')} — {edit.code}</div>
            <input type="hidden" name="code" value={edit.code} />
            <div className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('wh.name', '위치명')}</label>
              <input className="in req" name="name" aria-label="수정 위치명" defaultValue={edit.name} autoFocus />
              <label>{t('wh.remarks', '비고')}</label>
              <input className="in" name="remarks" defaultValue={edit.remarks || ''} />
              <label>{t('wh.hazardShort', '위험물')}</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" name="hazard" defaultChecked={edit.hazard} aria-label="위험물 허용" />
              </label>
              <label>{t('wh.inspCycle', '검사주기')}</label>
              <input className="in" name="inspection" aria-label="검사 주기"
                placeholder={t('wh.inspCyclePh', '예: 6개월 (빈 값 = 변경 없음)')} />
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
