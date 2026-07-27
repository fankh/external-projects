'use client'

import type { Money } from '@/lib/money'
import { useEffect, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { loadCostPanel, createPcr, createQuotation, type RunCostRow, type PcrResult, type QuotationRow, type FxRow, type TaxCodeRow } from './cost-actions'

const CALC_LABEL: Record<string, string> = { MATERIAL: '재료비', MANUFACTURING: '제조비', DIRECT: '직접경비' }

/** B18 — 원가 상세(cst_calc) → PCR 수익성 → 견적 확정(cst_quotation). */
// 18.65 — 가려진 금액을 1000 으로 나누면 NaN·0 이 된다. 나누지 말고 가려진 채로 보인다.
const k = (v: Money) => (typeof v === 'number' ? `${(v / 1000).toLocaleString()}K` : v === null || v === undefined ? '••••' : String(v))

export function CostPanel({ runId }: { runId: number }) {
  const { t } = useI18n()
  const [costs, setCosts] = useState<RunCostRow[] | null>(null)
  const [quotes, setQuotes] = useState<QuotationRow[]>([])
  const [fx, setFx] = useState<FxRow[]>([])
  const [taxOpts, setTaxOpts] = useState<TaxCodeRow[]>([])
  const [bt, setBt] = useState('PRE_SALES')
  const [cur, setCur] = useState('KRW')
  const [taxCode, setTaxCode] = useState('')
  const [pcr, setPcr] = useState<PcrResult | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    void loadCostPanel(runId).then((d) => { setCosts(d.costs); setQuotes(d.quotes); setFx(d.fx); setTaxOpts(d.taxCodes) })
  }, [runId])

  const makePcr = () => start(async () => {
    const r = await createPcr(bt)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setPcr(r.pcr!)
    setMsg({ text: `PCR ✓ — ${bt} 기여마진 ${k(r.pcr!.contributionMargin)} · EBIT ${k(r.pcr!.ebit)}` })
  })
  const makeQuote = () => start(async () => {
    const r = await createQuotation(bt, cur, taxCode)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    if (r.quotes) setQuotes(r.quotes)
    // 근거가 불완전하면 성공 문구로 뭉뚱그리지 않는다 — 확정은 됐지만 금액이 축소돼 있다.
    const q = r.result!
    const base = `견적 확정 ✓ — ${q.quotationNo} · ${q.currency} ${q.subtotal.toLocaleString()} + 세액 ${q.tax.toLocaleString()}(${q.taxPct}%) = ${q.total.toLocaleString()}`
    setMsg(q.basisComplete === false
      ? { text: `${base} · ⚠ ${t('run.quoteBasisIncomplete', '단가 미해결 {n}건이 0 원으로 집계된 원가 — 견적가가 실제보다 낮습니다').replace('{n}', String(q.unpricedCount ?? 0))}${q.unpricedCodes?.length ? ` (${q.unpricedCodes.slice(0, 3).join(', ')})` : ''}`, err: true }
      : { text: base })
  })

  return (
    <div style={{ display: 'flex', gap: 6, flex: 'none', maxHeight: 200, padding: '0 6px 6px' }}>
      <div className="gb" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', display: 'flex' }}>{t('run.costTitle', '원가 상세 (cst_calc)')}<span style={{ marginLeft: 'auto' }}>{costs?.length ? <Chip tone="ok">{t('run.calc3', '3분류')}</Chip> : <Chip tone="warn">{t('run.noCosts', '미적재')}</Chip>}</span></div>
        {costs && costs.length ? (
          <table className="g"><thead><tr><th>{t('run.calcType', '분류')}</th><th>{t('run.calcLines', '내역')}</th><th style={{ textAlign: 'right' }}>{t('run.calcTotal', '합계')}</th></tr></thead>
            <tbody>
              {costs.map((c) => <tr key={c.calcType}><td className="c">{CALC_LABEL[c.calcType] ?? c.calcType}</td><td className="c">{c.lines.length}건</td><td className="num">{c.total.toLocaleString()}</td></tr>)}
              <tr><td className="c" colSpan={2}><b>{t('run.directTotal', '직접비 계')}</b></td><td className="num"><b>{costs.reduce((s, c) => s + c.total, 0).toLocaleString()}</b></td></tr>
            </tbody></table>
        ) : <div style={{ padding: 8, fontSize: 11, color: 'var(--txt-mute)' }}>{t('run.noCostsHint', '원가 상세 없음 — 이 Run 실행분부터 cst_calc 적재')}</div>}
      </div>
      <div className="gb" style={{ flex: 1.3, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('run.pcrTitle', 'PCR 수익성 → 견적 (cst_pcr·cst_quotation)')}</div>
        <div style={{ display: 'flex', gap: 4, padding: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="in" value={bt} onChange={(e) => setBt(e.target.value)} style={{ height: 22, fontSize: 11 }}>
            <option value="PRE_SALES">Pre-Sales</option><option value="MAIN">Main</option>
          </select>
          <button className="b" disabled={pending || !costs?.length} onClick={makePcr} style={{ height: 22, fontSize: 11 }}>{t('run.pcrCreate', 'PCR 생성')}</button>
          <select className="in" value={cur} onChange={(e) => setCur(e.target.value)} style={{ height: 22, fontSize: 11 }}>
            {(fx.length ? fx.map((f) => f.currency) : ['KRW']).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="in" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} style={{ height: 22, fontSize: 11 }}>
            <option value="">{t('run.noTax', '세금 없음')}</option>
            {taxOpts.map((tt) => <option key={tt.code} value={tt.code}>{tt.code} {tt.ratePct}%</option>)}
          </select>
          <button className="b" disabled={pending} onClick={makeQuote} style={{ height: 22, fontSize: 11 }}>{t('run.quoteConfirm', '견적 확정')}</button>
          {pcr ? <span style={{ fontSize: 10.5 }}>{t('run.pcrMargin', '기여마진')} <b>{k(pcr.contributionMargin)}</b> · EBIT <b style={{ color: typeof pcr.ebit === 'number' && pcr.ebit >= 0 ? 'var(--ok)' : 'var(--err)' }}>{k(pcr.ebit)}</b></span> : null}
        </div>
        {quotes.length ? (
          <table className="g"><thead><tr><th>No.</th><th>{t('run.quoteTotal', '금액')}</th><th>{t('run.quoteTax', '세액')}</th><th>{t('dwg.dateCol', '일자')}</th><th>PDF</th></tr></thead>
            <tbody>{quotes.slice(0, 4).map((q) => (
              <tr key={q.quotationId}>
                <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{q.quotationNo}
                  {q.basisComplete === false ? (
                    <span style={{ color: 'var(--err)', fontWeight: 700, marginLeft: 4 }}
                      title={t('run.quoteBasisIncompleteHint', '발행 시점 원가에 단가 미해결이 있었습니다 — 금액이 실제보다 낮습니다')}>⚠{q.unpricedCount}</span>
                  ) : q.basisKnown === false ? (
                    <span style={{ color: 'var(--txt-mute)', marginLeft: 4 }}
                      title={t('run.quoteBasisUnknown', '이 기능 도입 전 발행분 — 발행 시점 근거를 확인할 수 없습니다')}>?</span>
                  ) : null}
                </td>
                <td className="num">{q.currency !== 'KRW' ? `${q.currency} ` : ''}{q.total.toLocaleString()}</td>
                <td className="num">{q.tax ? q.tax.toLocaleString() : '-'}</td>
                <td className="c">{q.date}</td>
                <td className="c"><a className="b" href={`/api/cost/quotation-pdf?id=${q.quotationId}`} target="_blank" rel="noreferrer" style={{ height: 18, fontSize: 10 }}>{t('common.preview', '미리보기')}</a></td>
              </tr>
            ))}</tbody></table>
        ) : <div style={{ padding: '0 8px 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('run.noQuotes', '확정 견적 없음 — PCR 생성 후 견적 확정')}</div>}
        {msg ? <div style={{ fontSize: 10.5, padding: '2px 6px', color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
      </div>
    </div>
  )
}
