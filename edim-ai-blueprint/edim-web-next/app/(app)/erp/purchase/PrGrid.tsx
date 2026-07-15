'use client'

/** 구매·발주 요청 — 다중선택 + QCR 발행 / PO 조건 발주 (N3b 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { createPo, issueQcr, type ActState } from './actions'

export interface PrRow {
  code: string; name: string; supplierCode: string; supplier: string
  qty: number; onHand: number; reserved: number; available: number
  price: number | null; requiredDate: string
}

const won = (n: number | null) => (n == null ? '—' : `₩ ${Math.round(n).toLocaleString()}`)

const cols: GridColumn<PrRow>[] = [
  { key: 'code', header: '코드', width: 110, code: true, render: (r) => r.code },
  { key: 'name', header: '품명', render: (r) => r.name },
  { key: 'supplier', header: '공급처', width: 110, render: (r) => r.supplier || '—' },
  { key: 'qty', header: '소요', width: 56, align: 'right', sortValue: (r) => r.qty, render: (r) => r.qty },
  { key: 'onhand', header: '보유', width: 56, align: 'right', sortValue: (r) => r.onHand, render: (r) => r.onHand },
  { key: 'avail', header: '가용', width: 56, align: 'right', sortValue: (r) => r.available, render: (r) => <b style={{ color: r.available >= r.qty ? 'var(--ok)' : 'var(--err)' }}>{r.available}</b> },
  { key: 'price', header: '단가', width: 100, align: 'right', sortValue: (r) => r.price ?? 0, render: (r) => won(r.price) },
  { key: 'req', header: '소요일', width: 72, align: 'center', render: (r) => r.requiredDate || '—' },
  { key: 'stock', header: '재고판정', width: 76, align: 'center', sortValue: (r) => (r.available >= r.qty ? 1 : 0), render: (r) => r.available >= r.qty ? <Chip tone="ok">충족</Chip> : <Chip tone="warn">발주</Chip> },
]

export function PrGrid({ rows }: { rows: PrRow[] }) {
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [terms, setTerms] = useState('FOB')
  const [transport, setTransport] = useState('육상')
  const [minQty, setMinQty] = useState('1')
  const [cert, setCert] = useState(false)
  const [note, setNote] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const codes = () => [...selected].map(String)
  const totalK = () => rows.filter((r) => selected.has(r.code))
    .reduce((s, r) => s + ((r.price ?? 0) * r.qty), 0) / 1000

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ color: 'var(--txt-dim)' }}>선택 {selected.size}품목</span>
        <input className="in" style={{ width: 120 }} placeholder="QCR 비고" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await issueQcr(codes(), note); setSt(r); if (r.ok) setSelected(new Set())
        })}>QCR 발행 (견적 요청)</button>
        <span className="sep" />
        <select className="in" style={{ width: 70 }} value={terms} onChange={(e) => setTerms(e.target.value)}>
          {['FOB', 'CIF', 'DDP', '착불'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="in" style={{ width: 64 }} value={transport} onChange={(e) => setTransport(e.target.value)}>
          {['육상', '해상', '항공'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="in" style={{ width: 60 }} title="최소 발주 수량" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input type="checkbox" checked={cert} onChange={(e) => setCert(e.target.checked)} />성적서
        </label>
        <button className="b run" disabled={pending} onClick={() => start(async () => {
          const r = await createPo(codes(), Math.round(totalK()), {
            deliveryTerms: terms, transport, minOrderQty: Math.max(1, Number(minQty) || 1), certRequired: cert,
          })
          setSt(r); if (r.ok) setSelected(new Set())
        })}>PO 발주 확정</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pr" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.code} multiSelect selectedKeys={selected} onSelectionChange={setSelected}
          emptyText="발주 요청 품목이 없습니다" />
      </div>
    </div>
  )
}
