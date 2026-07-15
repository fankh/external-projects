'use client'

/** 단가 대장 — 등록·마감·Excel Import (N3b 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { closePrice, createPrice, importPricesExcel, type ActState } from './actions'

export interface PriceRow {
  priceId?: number; code: string; name: string; supplier: string
  price: number; source: string; from: string; to: string | null; active: boolean
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

const cols: GridColumn<PriceRow>[] = [
  { key: 'code', header: '코드', width: 120, code: true, render: (r) => r.code },
  { key: 'name', header: '품명', render: (r) => r.name },
  { key: 'supplier', header: '공급처', width: 110, render: (r) => r.supplier || '—' },
  { key: 'price', header: '단가', width: 110, align: 'right', sortValue: (r) => r.price, render: (r) => won(r.price) },
  { key: 'source', header: '구분', width: 78, align: 'center', sortValue: (r) => r.source, render: (r) => <Chip tone="info">{r.source}</Chip> },
  { key: 'from', header: '유효 시작', width: 96, align: 'center', render: (r) => r.from },
  { key: 'to', header: '유효 종료', width: 96, align: 'center', render: (r) => r.to || '—' },
  { key: 'active', header: '상태', width: 58, align: 'center', sortValue: (r) => (r.active ? 1 : 0), render: (r) => r.active ? <Chip tone="ok">유효</Chip> : <Chip tone="warn">종료</Chip> },
]

export function PriceGrid({ rows }: { rows: PriceRow[] }) {
  const [regSt, regAction, regPending] = useActionState(createPrice, {} as ActState)
  const [impSt, impAction, impPending] = useActionState(importPricesExcel, {} as ActState)
  const [selKey, setSelKey] = useState<string | number | null>(null)
  const [closeTo, setCloseTo] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => (r.priceId ?? `${r.code}-${r.from}`) === selKey) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="code" placeholder="코드" style={{ width: 100 }} />
        <input className="in req" name="supplier" placeholder="공급처" style={{ width: 100 }} />
        <input className="in req" name="price" placeholder="단가" style={{ width: 84 }} />
        <select className="in" name="source" defaultValue="PURCHASE" style={{ width: 96 }}>
          {['PURCHASE', 'ESTIMATE', 'CONTRACT', 'STOCK'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="in" name="validFrom" placeholder="적용시작 YYYY-MM-DD" style={{ width: 128 }} />
        <button className="b run" type="submit" disabled={regPending}>＋ 단가 등록</button>
        {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error}</span> : null}
        {regSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok}</span> : null}
      </form>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" type="file" name="uploadedFile" accept=".xlsx" style={{ width: 200, fontSize: 10 }} />
          <button className="b" type="submit" disabled={impPending}>⬆ Excel Import</button>
        </form>
        <span className="sep" />
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `선택 ${sel.code} (${sel.supplier})` : '행 클릭=선택'}</span>
        <input className="in" style={{ width: 110 }} placeholder="종료일 YYYY-MM-DD" value={closeTo} onChange={(e) => setCloseTo(e.target.value)} />
        <button className="b" disabled={pending || !sel?.priceId} onClick={() => {
          if (!sel?.priceId) return
          start(async () => { setSt(await closePrice(sel.priceId!, closeTo)); setSelKey(null); setCloseTo('') })
        }}>적용 마감</button>
        {(impSt.error || st.error) ? <span style={{ color: 'var(--err)' }}>{impSt.error || st.error}</span> : null}
        {(impSt.ok || st.ok) ? <span style={{ color: 'var(--run)' }}>{impSt.ok || st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-prices" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.priceId ?? `${r.code}-${r.from}`} selectedKey={selKey ?? undefined}
          onRowClick={(r) => setSelKey(r.priceId ?? `${r.code}-${r.from}`)} emptyText="단가가 없습니다" />
      </div>
    </div>
  )
}
