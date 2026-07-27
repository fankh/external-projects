'use client'

/** Report Center — PCR 수익성 보고서 그리드 + PDF 발급 (RPT-07, N5 복구). */
import { wonBy, sortMoney, type Money } from '@/lib/money'
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { getPcrActual, getPcrBreakdown, getPcrCompare, type PcrActual, type PcrBreakdown, type PcrCompare } from './breakdownActions'

export interface PcrRow {
  pcrId: number; businessType: string; code: string; directCostTotal: Money
  contributionMargin: Money; ebit: Money; status: string; maskMode?: string
  unpricedCount?: number; basisComplete?: boolean
}

// 18.65 — 마스킹된 금액은 문자열('100000~')로도 온다. 숫자로 가정하면 ₩NaN 이 찍힌다.
// 18.75 — PCR 의 기여마진·EBIT 는 **아직 산출되지 않아** null 일 수도 있다. 응답의
// maskMode 로 '가려짐' 과 '값 없음' 을 갈라 적는다(둘 다 ••••로 찍으면 사실이 뭉개진다).
const won = (v: Money, mode?: string) => wonBy(v, mode, true)

export function PcrPanel({ rows }: { rows: PcrRow[] }) {
  const { t } = useI18n()
  // U19 — 비용 트리 (행 클릭 시 조회)
  const [bd, setBd] = useState<PcrBreakdown | null>(null)
  // D6 — 실적 반영 재계산 (추정 vs 실적 차이)
  const [act, setAct] = useState<PcrActual | null>(null)
  // U19 잔여 — 사업유형 다열 비교 (슬라이드 74 'Own acc./Biz.Type n' 열)
  const [cmp, setCmp] = useState<PcrCompare | null>(null)
  const [, start] = useTransition()
  const loadBd = (id: number) => start(async () => { setAct(null); setBd(await getPcrBreakdown(id)) })
  const loadAct = (id: number) => start(async () => setAct(await getPcrActual(id)))
  const loadCmp = () => start(async () => { setCmp(cmp ? null : await getPcrCompare()) })
  const cell = (v: number | string | null) =>
    v == null ? '—' : typeof v === 'string' ? v : `₩ ${Math.round(v).toLocaleString()}`
  const wonB = (n: number) => `\u20a9 ${Math.round(n).toLocaleString()}`
  const cols: GridColumn<PcrRow>[] = [
    { key: 'id', header: 'PCR', width: 52, align: 'right', code: true, sortValue: (r) => r.pcrId, render: (r) => r.pcrId },
    { key: 'type', header: t('rpt.bizType', '사업 유형'), width: 90, align: 'center', render: (r) => r.businessType },
    { key: 'code', header: t('rpt.finishedCode', '완성품 코드'), width: 140, code: true, render: (r) => r.code },
    { key: 'cost', header: t('rpt.directCost', '직접원가'), width: 110, align: 'right', sortValue: (r) => sortMoney(r.directCostTotal), render: (r) => won(r.directCostTotal, r.maskMode) },
    { key: 'margin', header: t('run.pcrMargin', '기여마진'), width: 110, align: 'right', sortValue: (r) => sortMoney(r.contributionMargin), render: (r) => won(r.contributionMargin, r.maskMode) },
    { key: 'ebit', header: 'EBIT', width: 110, align: 'right', sortValue: (r) => sortMoney(r.ebit), render: (r) => won(r.ebit, r.maskMode) },
    { key: 'status', header: t('rpt.status', '상태'), width: 70, align: 'center', render: (r) => <Chip tone="info">{r.status}</Chip> },
    { key: 'pdf', header: 'PDF', width: 56, align: 'center', render: (r) => (
      <button className="b" style={{ height: 18, fontSize: 10 }} title={t('rpt.pcrPdfHint', 'PCR 수익성 보고서 PDF (RPT-07)')}
        onClick={() => window.open(`/api/next/bin?kind=pcr&id=${r.pcrId}`, '_blank')}>🖶 PDF</button>) },
    { key: 'actual', header: t('rpt.actualCol', '실적'), width: 56, align: 'center', noSort: true, noFilter: true, render: (r) => (
      <button className="b" data-pcr-actual style={{ height: 18, fontSize: 10 }}
        title={t('rpt.actualHint', '실적 반영 재계산 (D-6) — 직접비를 구매 실적으로 치환')}
        onClick={(e) => { e.stopPropagation(); loadAct(r.pcrId) }}>Δ</button>) },
  ]
  return (
    <div className="gb" style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{t('rpt.pcrTitle', 'PCR 수익성 보고서 (RPT-07) — {n}건').replace('{n}', String(rows.length))}</span>
        <button className="b" data-pcr-compare style={{ height: 18, fontSize: 10, marginLeft: 'auto' }}
          title={t('rpt.compareHint', '사업유형별 PCR 을 열로 나열해 비교 (슬라이드 74 양식)')}
          onClick={loadCmp}>{cmp ? t('rpt.compareClose', '비교 닫기') : t('rpt.compare', '사업유형 비교')}</button>
      </div>
      {cmp ? (
        <div data-pcr-compare-panel style={{ borderBottom: '1px solid var(--line)', padding: 6, fontSize: 10.5, overflow: 'auto' }}>
          <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>
            {t('rpt.compareTitle', '사업유형 비교 (슬라이드 74)')}
            <span style={{ color: 'var(--txt-mute)', fontWeight: 400, marginLeft: 6 }}>
              {cmp.noteCode === 'noPcr' ? t('rpt.cmpNoPcr', 'PCR 없음 — Run 화면에서 PCR 생성')
                : cmp.noteCode === 'latestPerType' ? t('rpt.cmpLatest', '사업유형당 최신 PCR 1건')
                : cmp.note}
            </span>
          </div>
          {cmp.columns.length ? (
            <table className="g" style={{ width: '100%' }}>
              <thead><tr>
                <th style={{ width: 120 }}>{t('rpt.metric', '지표')}</th>
                {cmp.columns.map((c) => (
                  <th key={c.pcrId} style={{ textAlign: 'right' }}>
                    {c.businessType}
                    <div style={{ fontWeight: 400, color: 'var(--txt-mute)', fontSize: 9.5 }}>
                      #{c.pcrId}{c.marginRate != null ? ` · ${Math.round(c.marginRate * 100)}%` : ''}
                      {c.basisComplete === false ? (
                        <div style={{ color: 'var(--err)', fontWeight: 700 }}
                          title={t('rpt.basisIncompleteHint', '단가 미해결 품목이 0 원으로 집계돼 이 열의 금액은 실제보다 낮습니다')}>
                          ⚠ {t('rpt.basisIncomplete', '근거 불완전')} {c.unpricedCount}
                        </div>
                      ) : null}
                    </div>
                  </th>
                ))}
                {cmp.columns.length >= 2 ? <th style={{ width: 110, textAlign: 'right' }}>Δ</th> : null}
              </tr></thead>
              <tbody>
                {cmp.metrics.map((m) => (
                  <tr key={m.key} data-pcr-compare-row>
                    {/* 라벨은 키로 번역 — 서버가 주는 한국어는 폴백 */}
                    <td style={{ fontWeight: 600 }}>{t(`rpt.m.${m.key}`, m.label)}</td>
                    {m.cells.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{cell(v)}</td>)}
                    {cmp.columns.length >= 2 ? (
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.delta == null ? undefined : m.delta >= 0 ? 'var(--run)' : 'var(--err)' }}>
                        {m.delta == null ? '—' : `${m.delta >= 0 ? '+' : ''}${cell(m.delta)}`}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ color: 'var(--txt-mute)' }}>{t('rpt.noPcr', 'PCR 이 없습니다 (Run 원가 확정 후 생성)')}</div>}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pcr" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.pcrId} selectedKey={bd?.pcrId} onRowClick={(r) => loadBd(r.pcrId)}
          emptyText={t('rpt.noPcr', 'PCR 이 없습니다 (Run 원가 확정 후 생성)')} />
      </div>
      {act ? (
        <div data-pcr-actual-panel style={{ borderTop: '1px solid var(--line)', padding: 6, fontSize: 10.5 }}>
          <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>
            {t('rpt.actualTitle', '실적 반영 재계산 (D-6)')} — PCR #{act.pcrId}{act.projectNo ? ` · ${act.projectNo}` : ''}
            {!act.actualAvailable ? <span style={{ color: 'var(--warn, #B4820B)', marginLeft: 6 }}>{t('rpt.noActual', '구매 실적 없음 — 추정만 표시')}</span>
              : <span style={{ color: 'var(--txt-dim)', marginLeft: 6, fontWeight: 400 }}>{t('rpt.actualBasis', '실적')} {act.actualCount}{t('master.batchCount', '건')}</span>}
          </div>
          <table className="g" style={{ width: '100%' }}>
            <thead><tr><th></th><th>{t('rpt.estimate', '추정')}</th><th>{t('rpt.actualCol', '실적')}</th><th>Δ</th></tr></thead>
            <tbody>
              {([['Direct costs', act.estimate.directCost, act.actual.directCost, act.variance.directCost],
                 ['Contribution margin', act.estimate.margin, act.actual.margin, act.variance.margin],
                 ['EBIT', act.estimate.ebit, act.actual.ebit, act.variance.ebit]] as [string, number, number, number][]).map(([lbl, e2, a2, v2]) => (
                <tr key={lbl}>
                  <td style={{ fontWeight: 600 }}>{lbl}</td>
                  <td style={{ textAlign: 'right' }}>{wonB(e2)}</td>
                  <td style={{ textAlign: 'right' }}>{wonB(a2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: v2 > 0 === (lbl === 'Direct costs') ? 'var(--err)' : 'var(--run)' }}>
                    {v2 >= 0 ? '+' : ''}{wonB(v2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
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
              {bd.basisComplete === false ? (
                <tr><td colSpan={2} style={{ color: 'var(--err)', fontSize: 10.5, padding: '3px 0' }}>
                  ⚠ {t('rpt.basisIncompleteDetail', '단가 미해결 {n}건이 0 원으로 집계됨 — 원가·매출·EBIT 가 실제보다 낮습니다')
                       .replace('{n}', String(bd.unpricedCount ?? 0))}
                  {bd.unpricedCodes?.length ? ` (${bd.unpricedCodes.slice(0, 3).join(', ')}${bd.unpricedCodes.length > 3 ? ' 외' : ''})` : ''}
                </td></tr>
              ) : null}
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
