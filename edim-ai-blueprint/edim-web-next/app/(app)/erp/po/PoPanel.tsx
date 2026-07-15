'use client'

/** 발주 라이프사이클 패널 (N3b) — 생성 폼 + 상세(라인·승인·입고 GR). */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { approvePo, createPoOrder, receivePo, type ActState } from './actions'

export interface PoItem {
  poItemId: number; itemCode: string; itemName: string; orderQty: number
  unitPrice: number; receivedQty: number; remaining: number
}
export interface PoDetail {
  poNo: string; supplier: string; status: string; statusLabel: string
  orderDate: string; expectedDate: string | null; note: string; items: PoItem[]
}

export function PoCreateForm() {
  const [st, action, pending] = useActionState(createPoOrder, {} as ActState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <input className="in" name="supplier" placeholder="공급처" style={{ width: 100 }} />
      <input className="in" name="expectedDate" placeholder="예정일 YYYY-MM-DD" style={{ width: 116 }} />
      <input className="in" name="note" placeholder="비고" style={{ width: 110 }} />
      <textarea className="in" name="items" placeholder={'품명,수량,단가 (줄당 1건)\n예: 임펠러 #450,2,120000'}
        style={{ width: 240, height: 38, fontSize: 10.5, resize: 'vertical' }} />
      <button className="b run" type="submit" disabled={pending}>＋ 발주 생성</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}

export function PoDetailPanel({ detail }: { detail: PoDetail }) {
  const [qty, setQty] = useState<Record<number, string>>({})
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const receivable = detail.status === 'APPROVED' || detail.status === 'PARTIAL'

  return (
    <div className="gb" style={{ padding: 6, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <b style={{ color: 'var(--title-navy)' }}>{detail.poNo}</b>
        <Chip tone={detail.status === 'DONE' ? 'ok' : detail.status === 'DRAFT' ? 'info' : 'warn'}>{detail.statusLabel || detail.status}</Chip>
        <span style={{ color: 'var(--txt-dim)' }}>{detail.supplier || '—'} · 발주 {detail.orderDate}</span>
        {detail.status === 'DRAFT' ? (
          <button className="b run" disabled={pending}
            onClick={() => start(async () => setSt(await approvePo(detail.poNo)))}>승인</button>
        ) : null}
      </div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>품목</th><th>발주</th><th>기입고</th><th>잔여</th><th>입고 수량</th></tr></thead>
        <tbody>{detail.items.map((it) => (
          <tr key={it.poItemId}>
            <td>{it.itemName}</td>
            <td className="c">{it.orderQty}</td>
            <td className="c">{it.receivedQty}</td>
            <td className="c">{it.remaining}</td>
            <td className="c">
              <input className="in" style={{ width: 52, textAlign: 'right' }} disabled={!receivable || it.remaining <= 0}
                value={qty[it.poItemId] ?? ''} placeholder={it.remaining > 0 ? String(it.remaining) : '—'}
                onChange={(e) => setQty((q) => ({ ...q, [it.poItemId]: e.target.value }))} />
            </td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="b run" disabled={pending || !receivable} onClick={() => start(async () => {
          const items = detail.items.map((it) => ({ poItemId: it.poItemId, qty: Number(qty[it.poItemId]) || 0 }))
          const r = await receivePo(detail.poNo, items)
          setSt(r); if (r.ok) setQty({})
        })}>입고 처리 (GR)</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </div>
  )
}
