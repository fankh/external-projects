'use client'

/** Arrangement Set-Up (M-4-2) — 구성 코드 대장 + 구성품 CRUD 아일랜드 (N2 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { addComponent, createArrangement, deleteComponent, patchComponentQty, type ActState } from './actions'

export interface ArrangementRow {
  code: string; name: string; family: string
  direction: string; install: string; status: string; components: number
}
export interface ArrangementComponent {
  position: string; code: string; name: string; quantity: number; componentId?: number
}

const cols: GridColumn<ArrangementRow>[] = [
  { key: 'code', header: '구성 Code', width: 110, code: true, render: (r) => r.code },
  { key: 'name', header: '이름', render: (r) => r.name },
  { key: 'family', header: 'Family', width: 80, align: 'center', render: (r) => r.family || '—' },
  { key: 'dir', header: 'Direction', width: 80, align: 'center', render: (r) => r.direction || '—' },
  { key: 'install', header: 'Install', width: 76, align: 'center', render: (r) => r.install || '—' },
  { key: 'status', header: '상태', width: 76, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'info'}>{r.status}</Chip> },
  { key: 'n', header: '구성품', width: 56, align: 'right', sortValue: (r) => r.components, render: (r) => r.components },
]

export function ArrangementRegForm() {
  const [st, action, pending] = useActionState(createArrangement, {} as ActState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="code" placeholder="구성 Code (ARR-…)" style={{ width: 110 }} />
      <input className="in req" name="name" placeholder="이름" style={{ width: 130 }} />
      <input className="in" name="family" placeholder="Family" style={{ width: 80 }} />
      <input className="in" name="direction" placeholder="Direction" style={{ width: 80 }} />
      <input className="in" name="install" placeholder="Install" style={{ width: 80 }} />
      <button className="b run" type="submit" disabled={pending}>＋ 구성 등록</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}

export function ArrangementGrid({ rows, selectedCode }: { rows: ArrangementRow[]; selectedCode?: string | null }) {
  const router = useRouter()
  return <DenseGrid prefKey="next-arrangement" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.code} selectedKey={selectedCode ?? undefined}
    onRowClick={(r) => router.push(`/plm/arrangement?code=${encodeURIComponent(r.code)}`)}
    emptyText="구성 코드가 없습니다" />
}

export function ComponentPanel({ code, rows }: { code: string; rows: ArrangementComponent[] }) {
  const [pcode, setPcode] = useState('')
  const [pos, setPos] = useState('')
  const [qty, setQty] = useState('1')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" style={{ padding: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>구성품 — {code} ({rows.length}건)</div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>위치</th><th>코드</th><th>이름</th><th>수량</th><th></th></tr></thead>
        <tbody>
          {rows.length ? rows.map((c, i) => (
            <tr key={c.componentId ?? i}>
              <td className="c">{c.position || '—'}</td>
              <td className="code">{c.code}</td>
              <td>{c.name || '—'}</td>
              <td className="c">
                <input className="in" style={{ width: 44, textAlign: 'right' }} defaultValue={c.quantity}
                  disabled={c.componentId == null}
                  onBlur={(e) => {
                    const q = Number(e.target.value)
                    if (c.componentId != null && q > 0 && q !== c.quantity)
                      start(async () => setSt(await patchComponentQty(code, c.componentId!, q)))
                  }} />
              </td>
              <td className="c">
                {c.componentId != null ? (
                  <button className="b" disabled={pending} title="구성품 삭제"
                    onClick={() => start(async () => setSt(await deleteComponent(code, c.componentId!)))}>✕</button>
                ) : null}
              </td>
            </tr>
          )) : <tr><td colSpan={5} style={{ color: 'var(--txt-mute)', textAlign: 'center' }}>구성품 없음</td></tr>}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 110 }} placeholder="구성품 코드" value={pcode} onChange={(e) => setPcode(e.target.value)} />
        <input className="in" style={{ width: 60 }} placeholder="위치" value={pos} onChange={(e) => setPos(e.target.value)} />
        <input className="in" style={{ width: 44, textAlign: 'right' }} value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addComponent(code, pcode, pos, Math.max(1, Number(qty) || 1))
          setSt(r)
          if (r.ok) { setPcode(''); setPos(''); setQty('1') }
        })}>＋ 구성품</button>
      </div>
      {st.error ? <div style={{ color: 'var(--err)', marginTop: 3 }}>{st.error}</div> : null}
      {st.ok ? <div style={{ color: 'var(--run)', marginTop: 3 }}>{st.ok}</div> : null}
    </div>
  )
}
