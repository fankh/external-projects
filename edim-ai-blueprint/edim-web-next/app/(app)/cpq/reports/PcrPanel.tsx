'use client'

/** Report Center — PCR 수익성 보고서 그리드 + PDF 발급 (RPT-07, N5 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { getPcrBreakdown, type PcrBreakdown } from './breakdownActions'

export interface PcrRow {
  pcrId: number; businessType: string; code: string; directCostTotal: number
  contributionMargin: number | null; ebit: number | null; status: string
}

const won = (n: number | null) => (n == null ? '—' : `₩ ${Math.round(n).toLocaleString()}`)

export function PcrPanel({ rows }: { rows: PcrRow[] }) {
  const { t } = useI18n()
  // U19 — 비용 트리 (행 클릭 시 조회)
  const [bd, setBd] = useState<PcrBreakdown | null>(null)
  const [, start] = useTransition()
  const loadBd = (id: number) => start(async () => setBd(await getPcrBreakdown(id)))
  const wonB = (n: number) => `\u20a9 ${Math.round(n).toLocaleString()}`
  const cols: GridColumn<PcrRow>[] = [
    { key: 'id', header: 'PCR', width: 52, align: 'right', code: true, sortValue: (r) => r.pcrId, render: (r) => r.pcrId },
    { key: 'type', header: t('rpt.bizType', '사업 유형'), width: 90, align: 'center', render: (r) => r.businessType },
    { key: 'code', header: t('rpt.finishedCode', '완성품 코드'), width: 140, code: true, render: (r) => r.code },
    { key: 'cost', header: t('rpt.directCost', '직접원가'), width: 110, align: 'right', sortValue: (r) => r.directCostTotal, render: (r) => won(r.directCostTotal) },
    { key: 'margin', header: t('run.pcrMargin', '기여마진'), width: 110, align: 'right', sortValue: (r) => r.contributionMargin ?? 0, render: (r) => won(r.contributionMargin) },
    { key: 'ebit', header: 'EBIT', width: 110, align: 'right', sortValue: (r) => r.ebit ?? 0, render: (r) => won(r.ebit) },
    { key: 'status', header: t('rpt.status', '상태'), width: 70, align: 'center', render: (r) => <Chip tone="info">{r.status}</Chip> },
    { key: 'pdf', header: 'PDF', width: 56, align: 'center', render: (r) => (
      <button className="b" style={{ height: 18, fontSize: 10 }} title={t('rpt.pcrPdfHint', 'PCR 수익성 보고서 PDF (RPT-07)')}
        onClick={() => window.open(`/api/next/bin?kind=pcr&id=${r.pcrId}`, '_blank')}>🖶 PDF</button>) },
  ]
  return (
    <div className="gb" style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('rpt.pcrTitle', 'PCR 수익성 보고서 (RPT-07) — {n}건').replace('{n}', String(rows.length))}</div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pcr" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.pcrId} selectedKey={bd?.pcrId} onRowClick={(r) => loadBd(r.pcrId)}
          emptyText={t('rpt.noPcr', 'PCR 이 없습니다 (Run 원가 확정 후 생성)')} />
      </div>
      {bd ? (
        <div data-pcr-breakdown style={{ borderTop: '1px solid var(--line)', padding: 6, fontSize: 10.5, maxHeight: 260, overflow: 'auto' }}>
          <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>
            {t('rpt.breakdownTitle', '비용 트리 (슬라이드 74)')} — PCR #{bd.pcrId} · {bd.businessType} · {t('rpt.revenue', '매출')} {wonB(bd.revenue)}
          </div>
          <table className="g" style={{ width: '100%' }}>
            <tbody>
              {bd.sections.map((s2) => (
                <SectionRows key={s2.title} title={s2.title} rows={s2.rows} subtotal={s2.subtotal} won={wonB} />
              ))}
              <tr style={{ fontWeight: 700 }}><td>Direct costs total</td><td className="c" style={{ textAlign: 'right' }}>{wonB(bd.directCostTotal)}</td></tr>
              <tr style={{ fontWeight: 700, color: 'var(--run)' }}><td>Contribution margin</td><td style={{ textAlign: 'right' }}>{wonB(bd.contributionMargin)}</td></tr>
              <SectionRows title={`Sales & Adm. cost — ${bd.sga.basis}`} rows={bd.sga.rows} subtotal={bd.sga.subtotal} won={wonB} />
              <tr style={{ fontWeight: 700 }}><td>Full costs</td><td style={{ textAlign: 'right' }}>{wonB(bd.fullCosts)}</td></tr>
              <tr style={{ fontWeight: 700, color: bd.ebit >= 0 ? 'var(--run)' : 'var(--err)' }}><td>EBIT</td><td style={{ textAlign: 'right' }}>{wonB(bd.ebit)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function SectionRows({ title, rows, subtotal, won }: {
  title: string; rows: { name: string; amount: number }[]; subtotal: number; won: (n: number) => string
}) {
  return (
    <>
      <tr style={{ background: 'var(--grid-head, #DCE3EE)', fontWeight: 600 }}>
        <td>{title}</td><td style={{ textAlign: 'right' }}>{won(subtotal)}</td>
      </tr>
      {rows.map((r, i) => (
        <tr key={i}><td style={{ paddingLeft: 16, color: 'var(--txt-dim)' }}>{r.name}</td>
          <td style={{ textAlign: 'right', color: 'var(--txt-dim)' }}>{won(r.amount)}</td></tr>
      ))}
    </>
  )
}
