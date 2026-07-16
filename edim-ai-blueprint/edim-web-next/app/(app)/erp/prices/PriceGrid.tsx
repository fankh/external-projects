'use client'

/** 단가 대장 — 등록·마감·Excel Import (N3b 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { closePrice, createPrice, importPricesExcel, type ActState } from './actions'

export interface PriceRow {
  priceId?: number; code: string; name: string; supplier: string
  price: number; source: string; from: string; to: string | null; active: boolean
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

export function PriceGrid({ rows }: { rows: PriceRow[] }) {
  const { t } = useI18n()
  const [regSt, regAction, regPending] = useActionState(createPrice, {} as ActState)
  const [impSt, impAction, impPending] = useActionState(importPricesExcel, {} as ActState)
  const [selKey, setSelKey] = useState<string | number | null>(null)
  const [closeTo, setCloseTo] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => (r.priceId ?? `${r.code}-${r.from}`) === selKey) ?? null

  const cols: GridColumn<PriceRow>[] = [
    { key: 'code', header: t('price.code', '코드'), width: 120, code: true, render: (r) => r.code },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'supplier', header: t('price.supplier', '공급처'), width: 110, render: (r) => r.supplier || '—' },
    { key: 'price', header: t('price.priceLbl', '단가'), width: 110, align: 'right', sortValue: (r) => r.price, render: (r) => won(r.price) },
    { key: 'source', header: t('dash.kind', '구분'), width: 78, align: 'center', sortValue: (r) => r.source, render: (r) => <Chip tone="info">{r.source}</Chip> },
    { key: 'from', header: t('price.validFrom', '유효 시작'), width: 96, align: 'center', render: (r) => r.from },
    { key: 'to', header: t('price.validTo', '유효 종료'), width: 96, align: 'center', render: (r) => r.to || '—' },
    { key: 'active', header: t('prj.status', '상태'), width: 58, align: 'center', sortValue: (r) => (r.active ? 1 : 0), render: (r) => r.active ? <Chip tone="ok">{t('enum.active', '유효')}</Chip> : <Chip tone="warn">{t('enum.expired', '종료')}</Chip> },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal trigger={t('price.addPrice', '＋ 단가 등록')} title={t('price.regTitle', '단가 등록')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('price.code', '코드')}</label>
              <input className="in req" name="code" autoFocus />
              <label>{t('price.supplier', '공급처')}</label>
              <input className="in req" name="supplier" />
              <label>{t('price.priceLbl', '단가')}</label>
              <input className="in req" name="price" />
              <label>{t('dash.kind', '구분')}</label>
              <select className="in" name="source" defaultValue="PURCHASE">
                {['PURCHASE', 'ESTIMATE', 'CONTRACT', 'STOCK'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label>{t('price.validFrom', '유효 시작')}</label>
              <input className="in" name="validFrom" placeholder={t('price.validFromPh', '적용시작 YYYY-MM-DD')} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" type="file" name="uploadedFile" accept=".xlsx" style={{ width: 200, fontSize: 10 }} />
          <button className="b" type="submit" disabled={impPending}>⬆ Excel Import</button>
        </form>
        <span className="sep" />
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `${t('common.selected', '선택')} ${sel.code} (${sel.supplier})` : t('common.clickRow', '행 클릭=선택')}</span>
        <input className="in" style={{ width: 110 }} placeholder={t('price.closeToPh', '종료일 YYYY-MM-DD')} value={closeTo} onChange={(e) => setCloseTo(e.target.value)} />
        <button className="b" disabled={pending || !sel?.priceId} onClick={() => {
          if (!sel?.priceId) return
          start(async () => { setSt(await closePrice(sel.priceId!, closeTo)); setSelKey(null); setCloseTo('') })
        }}>{t('price.closeBtn', '적용 마감')}</button>
        {(impSt.error || st.error) ? <span style={{ color: 'var(--err)' }}>{impSt.error || st.error}</span> : null}
        {(impSt.ok || st.ok) ? <span style={{ color: 'var(--run)' }}>{impSt.ok || st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-prices" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.priceId ?? `${r.code}-${r.from}`} selectedKey={selKey ?? undefined}
          onRowClick={(r) => setSelKey(r.priceId ?? `${r.code}-${r.from}`)} emptyText={t('price.empty', '단가가 없습니다')} />
      </div>
    </div>
  )
}
