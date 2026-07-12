/** 다통화·세금 마스터 (M-13-1) — fx_rate·tax_code + 세금엔진 계산기.
 *  견적 통화 환산(→기준통화 KRW)·세액 계산 기준. SETUP 이상 편집. */
import { useCallback, useEffect, useState } from 'react'
import { financeService, type FxRow, type QuoteCalc, type TaxCodeRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function FinanceMasterScreen(_: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const canWrite = perm.canWrite('erp-finance')
  const [fx, setFx] = useState<FxRow[]>([])
  const [tax, setTax] = useState<TaxCodeRow[]>([])
  const [offline, setOffline] = useState(false)
  const [nc, setNc] = useState({ currency: '', rate: '' })
  const [nt, setNt] = useState({ code: '', name: '', ratePct: '' })
  // 세금엔진 계산기
  const [calc, setCalc] = useState({ currency: 'USD', amount: '10000', taxCode: '' })
  const [result, setResult] = useState<QuoteCalc | null>(null)

  const load = useCallback(() => {
    void financeService.fx().then((r) => { if (r === null) setOffline(true); else { setOffline(false); setFx(r) } })
    void financeService.taxCodes().then((r) => { if (r) setTax(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const addFx = () => {
    const r = Number(nc.rate)
    if (!nc.currency.trim() || !(r > 0)) { setStatusMsg(<span style={{ color: 'var(--err)' }}>통화·환율(&gt;0)</span>); return }
    void financeService.setFx(nc.currency.trim().toUpperCase(), r)
      .then((ok) => { if (ok) { setNc({ currency: '', rate: '' }); load(); setStatusMsg(`환율 ✓ — ${nc.currency.toUpperCase()} = ${r} KRW`) } })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const addTax = () => {
    const p = Number(nt.ratePct)
    if (!nt.code.trim() || !nt.name.trim() || Number.isNaN(p)) { setStatusMsg(<span style={{ color: 'var(--err)' }}>코드·명칭·세율</span>); return }
    void financeService.addTax(nt.code.trim().toUpperCase(), nt.name.trim(), p)
      .then((ok) => { if (ok) { setNt({ code: '', name: '', ratePct: '' }); load(); setStatusMsg(`세금코드 ✓ — ${nt.code.toUpperCase()} ${p}%`) } })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const runCalc = () => {
    const a = Number(calc.amount)
    if (Number.isNaN(a)) { setStatusMsg(<span style={{ color: 'var(--err)' }}>금액 확인</span>); return }
    void financeService.quoteCalc(calc.currency, a, calc.taxCode)
      .then((r) => { setResult(r); setStatusMsg(`계산 ✓ — ${r.currency} ${r.total.toLocaleString()} = ₩${r.baseTotal.toLocaleString()}`) })
      .catch((e: Error) => { setResult(null); setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>) })
  }

  const fxCols: GridColumn<FxRow>[] = [
    { key: 'cur', header: '통화', width: 70, align: 'center', code: true, render: (r) => r.currency },
    { key: 'rate', header: '환율 (→KRW)', width: 120, align: 'right', render: (r) => r.rate.toLocaleString() },
    { key: 'vf', header: '적용일', width: 100, align: 'center', render: (r) => r.validFrom },
    { key: 'act', header: '', width: 50, align: 'center', noSort: true, render: (r) => (r.currency === 'KRW' ? '' : <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite} onClick={() => void financeService.removeFx(r.fxId).then((ok) => ok && load())}>삭제</Btn>) },
  ]
  const taxCols: GridColumn<TaxCodeRow>[] = [
    { key: 'code', header: '코드', width: 90, code: true, render: (r) => r.code },
    { key: 'name', header: '명칭', render: (r) => r.name },
    { key: 'pct', header: '세율 %', width: 70, align: 'right', render: (r) => r.ratePct },
    { key: 'act', header: '', width: 50, align: 'center', noSort: true, render: (r) => <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite} onClick={() => void financeService.removeTax(r.taxId).then((ok) => ok && load())}>삭제</Btn> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>다통화·세금 마스터</span>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>기준통화 KRW · 환율/세금코드 관리 + 세액 계산기</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      {offline ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
          <GroupBox title={`환율 (fx_rate) — ${fx.length}`} noPad style={{ flex: 1, minHeight: 0 }}>
            <div className="qband" style={{ borderTop: 'none' }}>
              <input className="in" style={{ width: 60 }} value={nc.currency} placeholder="USD" aria-label="통화" onChange={(e) => setNc({ ...nc, currency: e.target.value })} />
              <input className="in" style={{ width: 90 }} value={nc.rate} placeholder="1350" aria-label="환율" onChange={(e) => setNc({ ...nc, rate: e.target.value })} />
              <Btn variant="pri" disabled={!canWrite} onClick={addFx}>＋ 환율</Btn>
            </div>
            <DenseGrid columns={fxCols} rows={fx} rowKey={(r) => r.currency} findable={false} />
          </GroupBox>
          <GroupBox title={`세금코드 (tax_code) — ${tax.length}`} noPad style={{ flex: 1, minHeight: 0 }}>
            <div className="qband" style={{ borderTop: 'none' }}>
              <input className="in" style={{ width: 70 }} value={nt.code} placeholder="VAT10" aria-label="코드" onChange={(e) => setNt({ ...nt, code: e.target.value })} />
              <input className="in" style={{ width: 90 }} value={nt.name} placeholder="부가세" aria-label="명칭" onChange={(e) => setNt({ ...nt, name: e.target.value })} />
              <input className="in" style={{ width: 50 }} value={nt.ratePct} placeholder="10" aria-label="세율" onChange={(e) => setNt({ ...nt, ratePct: e.target.value })} />
              <Btn variant="pri" disabled={!canWrite} onClick={addTax}>＋ 세금</Btn>
            </div>
            <DenseGrid columns={taxCols} rows={tax} rowKey={(r) => r.code} findable={false} />
          </GroupBox>
          <GroupBox title="세금엔진 계산기" style={{ width: 280, flex: 'none' }}>
            <div className="frm c2" style={{ fontSize: 10.5 }}>
              <label>통화</label>
              <Combo width={110} value={calc.currency} onChange={(v) => setCalc({ ...calc, currency: v })}
                options={fx.map((f) => f.currency)} />
              <label>금액</label>
              <input className="in" value={calc.amount} aria-label="금액" onChange={(e) => setCalc({ ...calc, amount: e.target.value })} />
              <label>세금코드</label>
              <Combo width={110} value={calc.taxCode} onChange={(v) => setCalc({ ...calc, taxCode: v })}
                options={[{ value: '', label: '(없음)' }, ...tax.map((tt) => ({ value: tt.code, label: `${tt.code} ${tt.ratePct}%` }))]} />
            </div>
            <div style={{ textAlign: 'right', margin: '6px 0' }}><Btn variant="pri" onClick={runCalc}>계산</Btn></div>
            {result ? (
              <div style={{ fontSize: 10.5, lineHeight: 1.9, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <Row k="공급가액" v={`${result.currency} ${result.amount.toLocaleString()}`} />
                <Row k={`세액 (${result.taxPct}%)`} v={`${result.currency} ${result.taxAmount.toLocaleString()}`} />
                <Row k="합계" v={`${result.currency} ${result.total.toLocaleString()}`} bold />
                <div style={{ borderTop: '1px dashed var(--line)', margin: '4px 0' }} />
                <Row k="환율" v={`1 ${result.currency} = ₩${result.rate.toLocaleString()}`} />
                <Row k="기준통화 합계" v={`₩${result.baseTotal.toLocaleString()}`} bold />
                <div style={{ textAlign: 'center', marginTop: 4 }}><Chip tone="ok">KRW {result.baseTotal.toLocaleString()}</Chip></div>
              </div>
            ) : <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 6 }}>통화·금액·세금코드 선택 후 계산</div>}
          </GroupBox>
        </div>
      )}
    </div>
  )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--txt-mute)', flex: 1 }}>{k}</span>
      <span style={{ fontFamily: 'Consolas, monospace', fontWeight: bold ? 700 : 400, color: bold ? 'var(--title-navy)' : 'var(--txt)' }}>{v}</span>
    </div>
  )
}
