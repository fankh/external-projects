'use client'

/** Raw Material·GPI — 재질 등록·수정 (N4 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { createMaterial, updateMaterial, type ActState } from './actions'

export interface MaterialRow {
  code: string; name: string; materialType: string
  density: number | null; standard: string; hazard: string
}

export function MaterialGrid({ rows }: { rows: MaterialRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<MaterialRow>[] = [
    { key: 'code', header: t('raw.codeCol', '재질 코드'), width: 120, code: true, render: (r) => r.code },
    { key: 'name', header: t('raw.name', '재질명'), render: (r) => r.name },
    { key: 'type', header: t('raw.type', '유형'), width: 90, align: 'center', sortValue: (r) => r.materialType, render: (r) => r.materialType || '—' },
    { key: 'density', header: t('raw.density', '밀도'), width: 72, align: 'right', sortValue: (r) => r.density ?? 0, render: (r) => r.density ?? '—' },
    { key: 'std', header: t('raw.standard', '규격'), width: 100, render: (r) => r.standard || '—' },
    { key: 'hazard', header: t('raw.hazardCol', '위험'), width: 72, align: 'center', sortValue: (r) => r.hazard, render: (r) => r.hazard ? <Chip tone="warn">{r.hazard}</Chip> : '—' },
  ]
  const [regSt, regAction, regPending] = useActionState(createMaterial, {} as ActState)
  const [selCode, setSelCode] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDensity, setNewDensity] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.code === selCode) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal trigger={t('raw.addBtn', '＋ 재질 등록')} title={t('raw.regTitle', '재질 등록')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('raw.codeCol', '재질 코드')}</label>
              <input className="in req" name="code" autoFocus />
              <label>{t('raw.name', '재질명')}</label>
              <input className="in req" name="name" />
              <label>{t('raw.type', '유형')}</label>
              <select className="in" name="materialType" defaultValue="STEEL">
                {['STEEL', 'STAINLESS', 'AL', 'PLASTIC', 'ETC'].map((ty) => <option key={ty}>{ty}</option>)}
              </select>
              <label>{t('raw.density', '밀도')}</label>
              <input className="in" name="density" />
              <label>{t('raw.standard', '규격')}</label>
              <input className="in" name="standard" placeholder={t('raw.standardPh', '규격 (KS 등)')} />
              <label>{t('raw.hazardCol', '위험')}</label>
              <input className="in" name="hazard" placeholder={t('raw.hazardPh', '위험 표기')} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
        <span className="sep" />
        <input className="in" style={{ width: 100 }} placeholder={t('raw.editNamePh', '새 재질명 (수정)')} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className="in" style={{ width: 62 }} placeholder={t('raw.editDensityPh', '새 밀도')} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
        <button className="b" disabled={pending || !sel || (!newName.trim() && !newDensity.trim())} onClick={(e) => {
          e.preventDefault()
          if (!sel) return
          start(async () => {
            setSt(await updateMaterial(sel.code, {
              ...(newName.trim() ? { name: newName.trim() } : {}),
              ...(newDensity.trim() ? { density: Number(newDensity) } : {}),
            }))
            setNewName(''); setNewDensity('')
          })
        }}>{t('raw.editBtn', '수정')}{sel ? ` (${sel.code})` : ''}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-materials" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.code} selectedKey={selCode ?? undefined}
          onRowClick={(r) => setSelCode(r.code)} emptyText={t('raw.empty', '재질이 없습니다')} />
      </div>
    </div>
  )
}
