'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'
import { saveMakeBuy } from './actions'

export interface MaterialRow { item: string; warehouse: string; minStock: number; supplier: string; makeBuy: 'MAKE' | 'BUY'; timeMin: number | null; remarks: string }

export function WorkProcessView({ initial, code }: { initial: MaterialRow[]; code: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState<MaterialRow[]>(initial)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)

  const flip = (item: string) => {
    setRows((rs) => rs.map((r) => r.item === item ? { ...r, makeBuy: r.makeBuy === 'MAKE' ? 'BUY' : 'MAKE' } : r))
    setDirty(true)
  }
  const save = () => start(async () => {
    const res = await saveMakeBuy(code, rows.map((r) => ({ item: r.item, makeOrBuy: r.makeBuy })))
    if (res.error) { setMsg({ text: res.error, err: true }); return }
    setDirty(false); setMsg({ text: `저장 ✓ — ${rows.length}행 MAKE/BUY (${code})` })
  })

  const cols: GridColumn<MaterialRow>[] = [
    { key: 'item', header: t('wp.itemCol', '자재'), width: 150, code: true, render: (r) => r.item },
    { key: 'warehouse', header: t('wp.warehouseCol', '창고'), width: 90, render: (r) => r.warehouse || '—' },
    { key: 'supplier', header: t('wp.supplierCol', '공급처'), width: 130, render: (r) => r.supplier || '—' },
    { key: 'minStock', header: t('wp.minStockCol', '안전재고'), width: 72, align: 'right', sortValue: (r) => r.minStock, render: (r) => r.minStock },
    { key: 'timeMin', header: t('wp.timeCol', '공수(분)'), width: 72, align: 'right', sortValue: (r) => r.timeMin ?? -1, render: (r) => r.timeMin ?? '—' },
    { key: 'makeBuy', header: 'MAKE/BUY', width: 96, align: 'center', sortValue: (r) => r.makeBuy,
      render: (r) => <button className="b" disabled={pending} onClick={() => flip(r.item)} style={{ height: 18, fontSize: 10, color: r.makeBuy === 'MAKE' ? 'var(--run)' : 'var(--title-navy)' }}>{r.makeBuy}</button> },
    { key: 'remarks', header: t('wp.remarksCol', '비고'), render: (r) => r.remarks || '—' },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>{t('wp.drawingLabel', '도면')}</label>
        <input className="in" defaultValue={code} style={{ height: 22, fontSize: 11, width: 130 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/plm/work-process?code=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('wp.flipHint', 'MAKE/BUY 셀 클릭으로 전환')}</span>
        <button className="b" disabled={!dirty || pending} onClick={save} style={{ height: 22, fontSize: 11, marginLeft: 'auto' }}>{pending ? t('wp.saving', '저장 중…') : t('wp.save', '저장')}</button>
        {msg ? <span style={{ fontSize: 11, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-work-process" colFilter columns={cols} rows={rows} rowKey={(r) => r.item} emptyText={t('wp.empty', '자재행이 없습니다')} />
      </div>
    </div>
  )
}
