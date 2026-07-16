'use client'

/** 배리언트 상수 — 값 등록·수정·폐기 (N4 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { addCodeValue, patchCodeValue, type ActState } from './actions'

export interface CodeValueRow { slot: string; itemName: string; valueCode: string; valueName: string; status: string; valueId?: number }

export function VariantGrid({ rows, group }: { rows: CodeValueRow[]; group: string }) {
  const { t } = useI18n()
  const cols: GridColumn<CodeValueRow>[] = [
    { key: 'slot', header: 'Slot', width: 64, align: 'center', code: true, render: (r) => r.slot },
    { key: 'itemName', header: t('variant.itemName', '항목명'), width: 160, render: (r) => r.itemName },
    { key: 'valueCode', header: t('variant.valueCode', '값 코드'), width: 100, code: true, render: (r) => r.valueCode },
    { key: 'valueName', header: t('variant.valueName', '값 이름'), render: (r) => r.valueName || '—' },
    { key: 'status', header: t('variant.status', '상태'), width: 96, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'DEPRECATED' ? 'warn' : r.status === 'PENDING' ? 'info' : 'ok'}>{r.status}</Chip> },
  ]
  const router = useRouter()
  const [regSt, regAction, regPending] = useActionState(addCodeValue, {} as ActState)
  const [selKey, setSelKey] = useState<string | number | null>(null)
  const [newName, setNewName] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r, i) => (r.valueId ?? `${r.slot}-${r.valueCode}-${i}`) === selKey) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>{t('variant.group', '그룹')}</label>
        <input className="in" defaultValue={group} style={{ height: 22, fontSize: 11, width: 80 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/variant?group=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="hidden" name="group" value={group} />
          <input className="in req" name="slot" placeholder="Slot" style={{ width: 52 }} />
          <input className="in req" name="valueCode" placeholder={t('variant.valueCode', '값 코드')} style={{ width: 80 }} />
          <input className="in" name="valueName" placeholder={t('variant.valueName', '값 이름')} style={{ width: 110 }} />
          <button className="b run" type="submit" disabled={regPending}>{t('variant.addBtn', '＋ 값 등록')}</button>
        </form>
        <span className="sep" />
        <input className="in" style={{ width: 110 }} placeholder={t('variant.editNamePh', '새 값 이름 (수정)')} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="b" disabled={pending || !sel?.valueId || !newName.trim()} onClick={() => {
          if (sel?.valueId) start(async () => { setSt(await patchCodeValue(sel.valueId!, { valueName: newName.trim() })); setNewName('') })
        }}>{t('variant.editBtn', '수정')}</button>
        <button className="b" disabled={pending || !sel?.valueId || sel.status === 'DEPRECATED'} onClick={() => {
          if (sel?.valueId) start(async () => setSt(await patchCodeValue(sel.valueId!, { deprecate: true })))
        }}>{t('variant.deprecate', '폐기')}</button>
        {(regSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey={`next-variant-${group}`} colFilter columns={cols} rows={rows}
          rowKey={(r, i) => r.valueId ?? `${r.slot}-${r.valueCode}-${i}`} selectedKey={selKey ?? undefined}
          onRowClick={(r, i) => setSelKey(r.valueId ?? `${r.slot}-${r.valueCode}-${i}`)}
          emptyText={t('variant.empty', '정의된 상수값이 없습니다')} />
      </div>
    </div>
  )
}
