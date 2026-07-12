/** D6 원가 실적 (Cost Actual) — 추정이 실적으로 검증되는 고리.
 *  PO 확정 단가 → 실적 원가 적재(cst_calc 추정과 분리) + 견적 vs 실적 차이 분석·차이율 경보. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { costActualService, type CostActual, type VarianceData } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const CAT_LABEL: Record<string, string> = {
  MATERIAL: '재료비', MANUFACTURING: '제조비', DIRECT: '직접경비',
}
const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`
const pct = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`

export function CostActualScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<CostActual[]>([])
  const [vd, setVd] = useState<VarianceData | null>(null)
  const [cat, setCat] = useState('MATERIAL')

  const load = useCallback(() => {
    void costActualService.list().then((r) => { if (r) setRows(r) })
    void costActualService.variance().then(setVd)
  }, [])
  useEffect(() => { load() }, [load])

  const record = useCallback(() => {
    const itemName = window.prompt('실적 품목명 (예: Casing Φ900)', '')?.trim() || ''
    const poNo = window.prompt('PO 번호 (확정 단가 근거, 생략 가능)', '')?.trim() || undefined
    const qty = Number((window.prompt('수량', '1') || '1').replace(/[^\d.]/g, '')) || 0
    const unitPrice = Number((window.prompt('확정 단가 (₩)', '0') || '0').replace(/[^\d.]/g, '')) || 0
    if (qty <= 0) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>수량은 0보다 커야 합니다</span>); return }
    void costActualService.create({ category: cat, itemName, poNo, qty, unitPrice })
      .then((amt) => {
        if (amt === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(`실적 적재 ✓ — ${CAT_LABEL[cat]} ${won(amt)} (추정 대비 차이 재계산)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [cat, load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F2: record }), [load, record]))

  const cols: GridColumn<CostActual>[] = [
    { key: 'cat', header: t('act.cat', '분류'), width: 76, align: 'center', render: (r) => CAT_LABEL[r.category] ?? r.category },
    { key: 'item', header: t('act.item', '품목'), render: (r) => r.itemName || r.itemCode || '-' },
    { key: 'po', header: 'PO', width: 110, render: (r) => r.poNo || '-' },
    { key: 'qty', header: t('act.qty', '수량'), width: 60, align: 'right', render: (r) => r.qty.toLocaleString() },
    { key: 'up', header: t('act.unit', '단가'), width: 100, align: 'right', render: (r) => won(r.unitPrice) },
    { key: 'amt', header: t('act.amt', '금액'), width: 120, align: 'right', code: true, render: (r) => won(r.amount) },
    { key: 'at', header: t('act.at', '적재'), width: 92, align: 'center', render: (r) => r.recordedAt },
  ]

  const vCols: GridColumn<VarianceData['categories'][number]>[] = [
    { key: 'l', header: t('act.vcat', '원가 분류'), render: (r) => r.label },
    { key: 'est', header: t('act.est', '추정(견적)'), width: 120, align: 'right', render: (r) => won(r.estimate) },
    { key: 'act', header: t('act.act', '실적'), width: 120, align: 'right', render: (r) => won(r.actual) },
    { key: 'var', header: t('act.var', '차이'), width: 120, align: 'right', render: (r) => <span style={{ color: r.variance > 0 ? 'var(--err)' : 'var(--ok)' }}>{won(r.variance)}</span> },
    {
      key: 'rate', header: t('act.rate', '차이율'), width: 90, align: 'right',
      render: (r) => <span style={{ color: r.alert ? 'var(--err)' : 'var(--txt)' }}>{pct(r.varianceRate)}{r.alert ? ' ⚠' : ''}</span>,
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('act.header', '원가 실적')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('act.hint', 'PO 확정 단가→실적 원가 적재(추정과 분리) · 견적 vs 실적 차이·차이율 경보 (D6)')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={cat} onChange={setCat} width={110} options={[
          { value: 'MATERIAL', label: '재료비' },
          { value: 'MANUFACTURING', label: '제조비' },
          { value: 'DIRECT', label: '직접경비' },
        ]} />
        <Btn onClick={record}>{t('act.recordF2', '실적 적재 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <GroupBox
          title={t('act.varTitle', '견적(추정) vs 실적 차이 분석')}
          right={vd ? (
            <Chip tone={vd.alert ? 'err' : 'ok'}>
              {vd.estimateAvailable
                ? `총 차이 ${pct(vd.totalVarianceRate)}${vd.alert ? ` — 임계 +${(vd.alertRate * 100).toFixed(0)}% 초과 경보` : ' — 정상'}`
                : '추정 Run 없음 — EDIM Run 먼저 실행'}
            </Chip>
          ) : undefined}
          noPad
        >
          {vd ? (
            <DenseGrid columns={vCols} rows={vd.categories} rowKey={(r) => r.category} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>차이 분석 로딩…</div>
          )}
        </GroupBox>
        {vd && vd.estimateAvailable ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { l: '총 추정', v: won(vd.totalEstimate), c: 'var(--txt)' },
              { l: '총 실적', v: won(vd.totalActual), c: 'var(--title-navy)' },
              { l: '총 차이', v: `${won(vd.totalVariance)} (${pct(vd.totalVarianceRate)})`, c: vd.alert ? 'var(--err)' : 'var(--ok)' },
            ].map((k) => (
              <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
              </div>
            ))}
          </div>
        ) : null}
        <GroupBox title={t('act.listTitle', '실적 원가 내역 — PO 확정 단가 기반 (cst_actual)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => String(r.actualId)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('act.empty', '실적 없음 — F2 로 적재 (PO 확정 단가→실적 원가)')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
