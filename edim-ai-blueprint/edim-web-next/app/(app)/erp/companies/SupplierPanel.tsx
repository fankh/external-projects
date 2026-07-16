'use client'

/** 공급처 평가 스코어카드 (P1 복구) — 발주 이행 지표 + 평가 이력 + 평가 등록. */
import { useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { addSupplierEval, type FormState } from './actions'

export interface SupplierMetrics {
  companyId: number; supplier: string; poCount: number; closedCount: number
  orderedQty: number; receivedQty: number; fulfillmentPct: number; suggestedDelivery: number
}
export interface SupplierEval {
  evalId: number; supplierId: number; supplier: string; period: string
  delivery: number; quality: number; price: number; total: number; grade: string; note: string; createdAt: string
}

const gradeTone = (g: string): 'ok' | 'warn' | 'err' | 'info' => g === 'A' ? 'ok' : g === 'B' ? 'info' : g === 'C' ? 'warn' : 'err'

export function SupplierPanel({ metrics, evals }: { metrics: SupplierMetrics | null; evals: SupplierEval[] }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState('')
  const [d, setD] = useState('80'); const [q, setQ] = useState('80'); const [pr, setPr] = useState('80')
  const [note, setNote] = useState('')
  const [st, setSt] = useState<FormState>({})
  const [pending, start] = useTransition()
  if (!metrics) return <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('supp.selectHint', '공급처(SUPPLIER) 행을 클릭하면 이행 지표·평가를 관리합니다')}</div>

  return (
    <div className="gb" style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('supp.scorecard', '공급처 평가')} — {metrics.supplier}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="chip info">{t('supp.poCount', '발주')} {metrics.poCount}</span>
        <span className="chip ok">{t('supp.fulfillment', '이행률')} {metrics.fulfillmentPct}%</span>
        <span className="chip info">{t('supp.qty', '발주/입고')} {metrics.orderedQty}/{metrics.receivedQty}</span>
        <span className="chip warn">{t('supp.suggested', '권장 배송점수')} {metrics.suggestedDelivery}</span>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>{t('supp.evalHistory', '평가 이력')} — {evals.length}건</div>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>{t('supp.period', '기간')}</th><th>{t('supp.delivery', '납기')}</th><th>{t('supp.quality', '품질')}</th><th>{t('supp.price', '가격')}</th><th>{t('supp.total', '총점')}</th><th>{t('supp.grade', '등급')}</th></tr></thead>
          <tbody>{evals.length ? evals.map((e) => (
            <tr key={e.evalId}><td className="c">{e.period}</td><td className="c">{e.delivery}</td><td className="c">{e.quality}</td>
              <td className="c">{e.price}</td><td className="c"><b>{e.total}</b></td><td className="c"><Chip tone={gradeTone(e.grade)}>{e.grade}</Chip></td></tr>
          )) : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('supp.noEval', '평가 없음')}</td></tr>}</tbody>
        </table>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{t('supp.newEval', '평가 등록')}</span>
        <input className="in" style={{ width: 76 }} placeholder="2026-H1" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <label>{t('supp.delivery', '납기')}<input className="in" style={{ width: 40, textAlign: 'right' }} value={d} onChange={(e) => setD(e.target.value)} /></label>
        <label>{t('supp.quality', '품질')}<input className="in" style={{ width: 40, textAlign: 'right' }} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>{t('supp.price', '가격')}<input className="in" style={{ width: 40, textAlign: 'right' }} value={pr} onChange={(e) => setPr(e.target.value)} /></label>
        <input className="in" style={{ width: 100 }} placeholder={t('supp.note', '비고')} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b run" disabled={pending} onClick={() => start(async () => {
          const r = await addSupplierEval(metrics.companyId, period, Number(d) || 0, Number(q) || 0, Number(pr) || 0, note)
          setSt(r); if (r.ok) { setPeriod(''); setNote('') }
        })}>{t('supp.saveEval', '평가 저장')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </div>
  )
}
