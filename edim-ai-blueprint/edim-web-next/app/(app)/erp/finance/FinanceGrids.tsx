'use client'

/** 다통화·세금 마스터 — 등록/삭제 + 세액 계산기 (N3 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { GroupBox } from '@/components/controls'
import { addFx, addTax, quoteCalc, removeFx, removeTax, type ActState, type QuoteCalc } from './actions'

export interface FxRow { fxId: number; currency: string; rate: number; validFrom: string }
export interface TaxRow { taxId: number; code: string; name: string; ratePct: number }

export function FinanceGrids({ fx, tax }: { fx: FxRow[]; tax: TaxRow[] }) {
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const [cur, setCur] = useState(''); const [rate, setRate] = useState(''); const [from, setFrom] = useState('')
  const [tCode, setTCode] = useState(''); const [tName, setTName] = useState(''); const [tRate, setTRate] = useState('')
  const [cCur, setCCur] = useState('KRW'); const [cAmt, setCAmt] = useState(''); const [cTax, setCTax] = useState('')
  const [calc, setCalc] = useState<QuoteCalc | null>(null)

  const fxCols: GridColumn<FxRow>[] = [
    { key: 'cur', header: '통화', width: 70, align: 'center', code: true, render: (r) => r.currency },
    { key: 'rate', header: '환율 (KRW)', width: 110, align: 'right', sortValue: (r) => r.rate, render: (r) => r.rate.toLocaleString() },
    { key: 'from', header: '적용 시작', width: 100, align: 'center', render: (r) => r.validFrom },
    { key: 'del', header: '', width: 36, align: 'center', render: (r) => (
      <button className="b" disabled={pending} title="삭제"
        onClick={() => start(async () => setSt(await removeFx(r.fxId)))}>✕</button>) },
  ]
  const taxCols: GridColumn<TaxRow>[] = [
    { key: 'code', header: '코드', width: 84, align: 'center', code: true, render: (r) => r.code },
    { key: 'name', header: '세금명', render: (r) => r.name },
    { key: 'rate', header: '세율 (%)', width: 80, align: 'right', sortValue: (r) => r.ratePct, render: (r) => `${r.ratePct}%` },
    { key: 'del', header: '', width: 36, align: 'center', render: (r) => (
      <button className="b" disabled={pending} title="삭제"
        onClick={() => start(async () => setSt(await removeTax(r.taxId)))}>✕</button>) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
        <GroupBox title={`환율 마스터 — ${fx.length}건`} noPad style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DenseGrid prefKey="next-fx" columns={fxCols} rows={fx} rowKey={(r) => r.fxId} emptyText="환율이 없습니다" />
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, borderTop: '1px solid var(--line)' }}>
            <input className="in" style={{ width: 52 }} placeholder="USD" value={cur} onChange={(e) => setCur(e.target.value)} />
            <input className="in" style={{ width: 82 }} placeholder="환율(KRW)" value={rate} onChange={(e) => setRate(e.target.value)} />
            <input className="in" style={{ width: 96 }} placeholder="적용 시작일" value={from} onChange={(e) => setFrom(e.target.value)} />
            <button className="b run" disabled={pending} onClick={() => start(async () => {
              const r = await addFx(cur, Number(rate) || 0, from); setSt(r); if (r.ok) { setCur(''); setRate(''); setFrom('') }
            })}>＋ 환율</button>
          </div>
        </GroupBox>
        <GroupBox title={`세금 코드 — ${tax.length}건`} noPad style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DenseGrid prefKey="next-tax" columns={taxCols} rows={tax} rowKey={(r) => r.taxId} emptyText="세금 코드가 없습니다" />
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, borderTop: '1px solid var(--line)' }}>
            <input className="in" style={{ width: 64 }} placeholder="코드" value={tCode} onChange={(e) => setTCode(e.target.value)} />
            <input className="in" style={{ flex: 1 }} placeholder="세금명" value={tName} onChange={(e) => setTName(e.target.value)} />
            <input className="in" style={{ width: 56 }} placeholder="%" value={tRate} onChange={(e) => setTRate(e.target.value)} />
            <button className="b run" disabled={pending} onClick={() => start(async () => {
              const r = await addTax(tCode, tName, Number(tRate) || 0); setSt(r); if (r.ok) { setTCode(''); setTName(''); setTRate('') }
            })}>＋ 세금</button>
          </div>
        </GroupBox>
      </div>
      <GroupBox title="세액 계산기 (통화 → 세액·KRW 환산)" style={{ flex: 'none' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
          <select className="in" style={{ width: 70 }} value={cCur} onChange={(e) => setCCur(e.target.value)}>
            <option value="KRW">KRW</option>
            {fx.map((f) => <option key={f.fxId} value={f.currency}>{f.currency}</option>)}
          </select>
          <input className="in" style={{ width: 110 }} placeholder="금액" value={cAmt} onChange={(e) => setCAmt(e.target.value)} />
          <select className="in" style={{ width: 110 }} value={cTax} onChange={(e) => setCTax(e.target.value)}>
            <option value="">세금 없음</option>
            {tax.map((t) => <option key={t.taxId} value={t.code}>{t.code} ({t.ratePct}%)</option>)}
          </select>
          <button className="b" disabled={pending} onClick={() => start(async () => {
            const r = await quoteCalc(cCur, Number(cAmt) || 0, cTax)
            if (r.error) { setSt({ error: r.error }); setCalc(null) } else { setCalc(r.result ?? null); setSt({}) }
          })}>계산</button>
          {calc ? (
            <span>세액 <b>{calc.tax.toLocaleString()}</b> · 합계 <b>{calc.total.toLocaleString()} {calc.currency}</b> · KRW 환산 <b>₩{Math.round(calc.krwTotal).toLocaleString()}</b></span>
          ) : null}
          {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
          {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
        </div>
      </GroupBox>
    </div>
  )
}
