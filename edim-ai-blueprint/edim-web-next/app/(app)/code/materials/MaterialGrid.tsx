'use client'

/** Raw Material·GPI — 재질 등록·수정 (N4 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
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
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="code" placeholder={t('raw.codeCol', '재질 코드')} style={{ width: 90 }} />
        <input className="in req" name="name" placeholder={t('raw.name', '재질명')} style={{ width: 120 }} />
        <select className="in" name="materialType" defaultValue="STEEL" style={{ width: 86 }}>
          {['STEEL', 'STAINLESS', 'AL', 'PLASTIC', 'ETC'].map((ty) => <option key={ty}>{ty}</option>)}
        </select>
        <input className="in" name="density" placeholder={t('raw.density', '밀도')} style={{ width: 62 }} />
        <input className="in" name="standard" placeholder={t('raw.standardPh', '규격 (KS 등)')} style={{ width: 96 }} />
        <input className="in" name="hazard" placeholder={t('raw.hazardPh', '위험 표기')} style={{ width: 76 }} />
        <button className="b run" type="submit" disabled={regPending}>{t('raw.addBtn', '＋ 재질 등록')}</button>
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
        {(regSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </form>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-materials" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.code} selectedKey={selCode ?? undefined}
          onRowClick={(r) => setSelCode(r.code)} emptyText={t('raw.empty', '재질이 없습니다')} />
      </div>
    </div>
  )
}
