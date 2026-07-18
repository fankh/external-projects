'use client'

/** Work Process (S-4-1-2) — MAKE/BUY + 공정 파라미터 (U3, 슬라이드 45).
 *  작업장·창고·최소재고·인원·Skill·W.Time·비고 인라인 편집 → F12/저장 일괄 영속. */
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'
import { saveMakeBuy } from './actions'

export interface MaterialRow {
  item: string; warehouse: string; minStock: number; supplier: string
  makeBuy: 'MAKE' | 'BUY'; timeMin: number | null; remarks: string
  workshop?: string; person?: number | null; skill?: string
}

export function WorkProcessView({ initial, code }: { initial: MaterialRow[]; code: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState<MaterialRow[]>(initial)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)

  const patch = (item: string, p: Partial<MaterialRow>) => {
    setRows((rs) => rs.map((r) => (r.item === item ? { ...r, ...p } : r)))
    setDirty(true)
  }
  const flip = (item: string) => {
    setRows((rs) => rs.map((r) => r.item === item ? { ...r, makeBuy: r.makeBuy === 'MAKE' ? 'BUY' : 'MAKE' } : r))
    setDirty(true)
  }
  const save = () => start(async () => {
    const res = await saveMakeBuy(code, rows.map((r) => ({
      item: r.item, makeOrBuy: r.makeBuy, workshop: r.workshop ?? '', warehouse: r.warehouse,
      minStock: r.minStock, person: r.person ?? null, skill: r.skill ?? '',
      timeMin: r.timeMin, remarks: r.remarks,
    })))
    if (res.error) { setMsg({ text: res.error, err: true }); return }
    setDirty(false); setMsg({ text: `저장 ✓ — ${rows.length}행 공정 파라미터 (${code})` })
  })

  // F12 = 저장 (셸 edim-fkey 수신)
  useEffect(() => {
    const onFKey = (e: Event) => { if ((e as CustomEvent).detail === 'F12') save() }
    window.addEventListener('edim-fkey', onFKey)
    return () => window.removeEventListener('edim-fkey', onFKey)
  })  // save 는 최신 rows 클로저 필요 — 매 렌더 재구독

  const inCell = (r: MaterialRow, key: 'workshop' | 'warehouse' | 'skill' | 'remarks', width: number) => (
    <input className="in" value={(r[key] as string) ?? ''} style={{ width, height: 17, fontSize: 10 }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => patch(r.item, { [key]: e.target.value } as Partial<MaterialRow>)} />
  )
  const numCell = (r: MaterialRow, key: 'minStock' | 'person' | 'timeMin', width: number) => (
    <input className="in" value={r[key] ?? ''} style={{ width, height: 17, fontSize: 10, textAlign: 'right' }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value.trim()
        patch(r.item, { [key]: v === '' ? (key === 'minStock' ? 0 : null) : Number(v) || 0 } as Partial<MaterialRow>)
      }} />
  )

  const cols: GridColumn<MaterialRow>[] = [
    { key: 'item', header: t('wp.itemCol', '자재'), width: 140, code: true, render: (r) => r.item },
    { key: 'supplier', header: t('wp.supplierCol', '공급처'), width: 110, render: (r) => r.supplier || '—' },
    { key: 'makeBuy', header: 'MAKE/BUY', width: 84, align: 'center', sortValue: (r) => r.makeBuy,
      render: (r) => <button className="b" disabled={pending} onClick={(e) => { e.stopPropagation(); flip(r.item) }} style={{ height: 18, fontSize: 10, color: r.makeBuy === 'MAKE' ? 'var(--run)' : 'var(--title-navy)' }}>{r.makeBuy}</button> },
    { key: 'workshop', header: t('wp.workshopCol', '작업장'), width: 92, noSort: true, render: (r) => inCell(r, 'workshop', 82) },
    { key: 'person', header: t('wp.personCol', '인원'), width: 52, align: 'right', noSort: true, render: (r) => numCell(r, 'person', 40) },
    { key: 'skill', header: 'Skill', width: 56, noSort: true, render: (r) => inCell(r, 'skill', 44) },
    { key: 'timeMin', header: t('wp.timeCol', 'W.Time'), width: 62, align: 'right', noSort: true, render: (r) => numCell(r, 'timeMin', 50) },
    { key: 'warehouse', header: t('wp.warehouseCol', '창고'), width: 82, noSort: true, render: (r) => inCell(r, 'warehouse', 72) },
    { key: 'minStock', header: t('wp.minStockCol', '안전재고'), width: 66, align: 'right', noSort: true, render: (r) => numCell(r, 'minStock', 54) },
    { key: 'remarks', header: t('wp.remarksCol', '비고'), noSort: true, render: (r) => inCell(r, 'remarks', 150) },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>{t('wp.drawingLabel', '도면')}</label>
        <input className="in" defaultValue={code} style={{ height: 22, fontSize: 11, width: 130 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/plm/work-process?code=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('wp.paramHint', '공정 파라미터(작업장·인원·Skill·W.Time·창고·재고) 인라인 편집 — F12 저장')}</span>
        <button className="b run" data-wp-save disabled={!dirty || pending} onClick={save} style={{ height: 22, fontSize: 11, marginLeft: 'auto' }}>{pending ? t('wp.saving', '저장 중…') : `${t('wp.save', '저장')} F12`}</button>
        {msg ? <span style={{ fontSize: 11, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-work-process" colFilter columns={cols} rows={rows} rowKey={(r) => r.item} emptyText={t('wp.empty', '자재행이 없습니다')} />
      </div>
    </div>
  )
}
