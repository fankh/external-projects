'use client'

/** 부품 대장 액션 패널 (N2) — 등록 폼 + 선택 부품의 공급자 코드 매핑(ERP-018). */
import { useActionState, useState, useTransition } from 'react'
import { addSupplierCode, createPart, type ActState } from './actions'

export interface SupplierCodeRow { supplier: string; supplierCode: string; supplierName: string }

export function PartRegForm() {
  const [st, action, pending] = useActionState(createPart, {} as ActState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="partNo" placeholder="부품번호" style={{ width: 110 }} />
      <input className="in req" name="name" placeholder="부품명" style={{ width: 130 }} />
      <input className="in" name="spec" placeholder="사양" style={{ width: 120 }} />
      <input className="in" name="materialCode" placeholder="재질" style={{ width: 80 }} />
      <input className="in" name="supplier" placeholder="공급처" style={{ width: 100 }} />
      <input className="in" name="unit" placeholder="단위" defaultValue="EA" style={{ width: 46 }} />
      <input className="in" name="weight" placeholder="중량" style={{ width: 60 }} />
      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
        <input type="checkbox" name="isStandard" />표준
      </label>
      <button className="b run" type="submit" disabled={pending}>＋ 부품 등록</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}

export function SupplierCodePanel({ partNo, rows }: { partNo: string; rows: SupplierCodeRow[] }) {
  const [supplier, setSupplier] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" style={{ padding: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>공급자 코드 매핑 (ERP-018) — {partNo}</div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>공급처</th><th>공급자 코드</th><th>공급자 품명</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={i}><td>{r.supplier}</td><td className="code">{r.supplierCode}</td><td>{r.supplierName || '—'}</td></tr>
          )) : <tr><td colSpan={3} style={{ color: 'var(--txt-mute)', textAlign: 'center' }}>매핑 없음</td></tr>}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 90 }} placeholder="공급처" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        <input className="in" style={{ width: 90 }} placeholder="공급자 코드" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="in" style={{ flex: 1, minWidth: 80 }} placeholder="공급자 품명" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addSupplierCode(partNo, supplier, code, name)
          setSt(r)
          if (r.ok) { setSupplier(''); setCode(''); setName('') }
        })}>＋ 매핑</button>
      </div>
      {st.error ? <div style={{ color: 'var(--err)', marginTop: 3 }}>{st.error}</div> : null}
      {st.ok ? <div style={{ color: 'var(--run)', marginTop: 3 }}>{st.ok}</div> : null}
    </div>
  )
}
