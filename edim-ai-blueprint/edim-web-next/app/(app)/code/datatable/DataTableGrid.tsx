'use client'

/** 데이터 Table — 행 선택 편집·추가·삭제·Excel 왕복 (N4b 복구). */
import { useActionState, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'
import { useFKeys } from '@/hooks/useFKeys'
import { addTableRow, deleteTableRow, importTableExcel, updateTableRow, type ActState } from './actions'

export interface TableRow { key: string; values: Record<string, string | number | null> }

const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/** 동적 컬럼 그리드 — columns(string[]) 로 GridColumn 을 런타임 생성. */
export function DataTableGrid({ name, columns, rows }: { name: string; columns: string[]; rows: TableRow[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [impSt, impAction, impPending] = useActionState(importTableExcel, {} as ActState)
  const [selKey, setSelKey] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.key === selKey) ?? null

  const cols: GridColumn<TableRow>[] = [
    { key: '__key', header: 'Key', width: 80, align: 'center', code: true, sortValue: (r) => r.key, render: (r) => r.key },
    ...columns.map((c) => ({
      key: c, header: c, align: 'right' as const,
      sortValue: (r: TableRow) => { const v = r.values[c]; return typeof v === 'number' ? v : (v ?? '') },
      render: (r: TableRow) => { const v = r.values[c]; return v == null || v === '' ? '—' : String(v) },
    })),
  ]

  const selectRow = (r: TableRow) => {
    setSelKey(r.key)
    setEdit(Object.fromEntries(columns.map((c) => [c, r.values[c] == null ? '' : String(r.values[c])])))
  }
  const editValues = (): Record<string, number | null> =>
    Object.fromEntries(columns.map((c) => [c, toNum(edit[c] ?? '')]))

  // U25 — 그래프 마법사 (슬라이드 59): 열 매핑 → 라인/막대 SVG
  const [chartOpen, setChartOpen] = useState(false)

  // N6 — F-key 수신: F12 저장(선택 행) · F3 삭제
  useFKeys({
    F12: () => { if (sel) start(async () => setSt(await updateTableRow(name, sel.key, editValues()))) },
    F3: () => {
      if (sel && confirm(`행 ${sel.key} 를 삭제하시겠습니까?`))
        start(async () => { setSt(await deleteTableRow(name, sel.key)); setSelKey(null) })
    },
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px 0', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>Table</label>
        <input className="in" defaultValue={name} style={{ height: 22, fontSize: 11, width: 110 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/datatable?name=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <button className="b" data-chart-wizard onClick={() => setChartOpen((v) => !v)} style={{ height: 22, fontSize: 11 }}
          title={t('dtable.chartHint', '그래프 마법사 — 열 매핑 → 라인/막대 차트 (슬라이드 59)')}>📊 {t('dtable.chart', '차트')}</button>
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="hidden" name="name" value={name} />
          <input className="in" type="file" name="uploadedFile" accept=".xlsx" style={{ width: 180, fontSize: 10 }} />
          <button className="b" type="submit" disabled={impPending}>{t('dtable.importBtn', '⬆ Import')}</button>
        </form>
        <button className="b" onClick={() => window.open(`/api/next/xlsx?kind=table&id=${encodeURIComponent(name)}`, '_blank')}>{t('dtable.exportBtn', '⬇ Export')}</button>
        <span className="sep" />
        <input className="in" style={{ width: 76 }} placeholder={t('dtable.newKeyPh', '새 Key')} value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addTableRow(name, newKey, Object.fromEntries(columns.map((c) => [c, null])))
          setSt(r); if (r.ok) setNewKey('')
        })}>{t('dtable.addRow', '＋ 행 추가')}</button>
        {(impSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{impSt.error || st.error}</span> : null}
        {(impSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{impSt.ok || st.ok}</span> : null}
      </div>
      {sel ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 6px', flexWrap: 'wrap', fontSize: 11 }}>
          <b className="code">{sel.key}</b>
          {columns.map((c) => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ color: 'var(--txt-dim)' }}>{c}</span>
              <input className="in" style={{ width: 64, textAlign: 'right' }} value={edit[c] ?? ''}
                onChange={(e) => setEdit((cur) => ({ ...cur, [c]: e.target.value }))} />
            </label>
          ))}
          <button className="b run" disabled={pending} onClick={() => start(async () => setSt(await updateTableRow(name, sel.key, editValues())))}>{t('subcode.saveF12', '저장 (F12)')}</button>
          <button className="b" disabled={pending} onClick={() => {
            if (confirm(`행 ${sel.key} 를 삭제하시겠습니까?`))
              start(async () => { setSt(await deleteTableRow(name, sel.key)); setSelKey(null) })
          }}>{t('dtable.delRow', '행 삭제')}</button>
        </div>
      ) : <div style={{ padding: '0 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('dtable.rowClickHint', '행 클릭 = 편집 패널 열기')}</div>}
      {chartOpen ? <ChartWizard rows={rows} columns={columns} name={name} onClose={() => setChartOpen(false)} /> : null}
      <div style={{ flex: 1, minHeight: 0, padding: '0 6px 6px' }}>
        <DenseGrid prefKey={`next-table-${name}`} colFilter columns={cols} rows={rows}
          rowKey={(r) => r.key} selectedKey={selKey ?? undefined}
          onRowClick={selectRow} emptyText={t('dtable.empty', '데이터 행이 없습니다')} />
      </div>
    </div>
  )
}

/** U25 — 그래프 마법사: X=Key, 시리즈=숫자 열 선택, 라인/막대 SVG (외부 라이브러리 없음). */
const CHART_COLORS = ['#2F6FB4', '#3E9B57', '#C8552F', '#8058A5', '#B48A2F', '#4B8F8C']

function ChartWizard({ rows, columns, name, onClose }: {
  rows: TableRow[]; columns: string[]; name: string; onClose: () => void
}) {
  const { t } = useI18n()
  // U25 잔여 — 문서 연계: 차트 SVG 다운로드·인쇄
  const svgRef = useRef<SVGSVGElement>(null)
  const downloadSvg = () => {
    const el = svgRef.current
    if (!el) return
    const blob = new Blob(['<?xml version="1.0"?>\n' + el.outerHTML], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chart-${name}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const printChart = () => {
    const el = svgRef.current
    if (!el) return
    const w = window.open('', '_blank', 'width=820,height=460')
    if (!w) return
    w.document.write(`<title>${t('dtable.chartDocTitle', '차트')} — ${name}</title><body style="margin:16px;font-family:sans-serif"><h3 style="margin:0 0 8px">${name}</h3>${el.outerHTML}</body>`)
    w.document.close()
    w.focus()
    w.print()
  }
  const numericCols = columns.filter((c) => rows.some((r) => typeof r.values[c] === 'number'))
  const [series, setSeries] = useState<string[]>(numericCols.slice(0, 2))
  const [kind, setKind] = useState<'line' | 'bar'>('line')
  const toggle = (c: string) => setSeries((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))

  const W = 560, H = 220, PAD = { l: 46, r: 10, t: 10, b: 24 }
  const data = rows.map((r) => ({ key: r.key, vals: series.map((c) => (typeof r.values[c] === 'number' ? r.values[c] as number : null)) }))
  const flat = data.flatMap((d) => d.vals).filter((v): v is number => v != null)
  const vMax = flat.length ? Math.max(...flat, 0) : 1
  const vMin = flat.length ? Math.min(...flat, 0) : 0
  const span = vMax - vMin || 1
  const px = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (data.length - 1))
  const py = (v: number) => H - PAD.b - ((v - vMin) * (H - PAD.t - PAD.b)) / span
  const bw = Math.max(4, (W - PAD.l - PAD.r) / Math.max(1, data.length) / (series.length + 1))

  return (
    <div data-chart-panel className="gb" style={{ padding: 6, display: 'flex', gap: 10, fontSize: 10.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
        <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('dtable.chartTitle', '그래프 마법사')} — {name}<span style={{ float: 'right', cursor: 'pointer' }} onClick={onClose}>✕</span></div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="b" data-chart-dl onClick={downloadSvg} style={{ height: 19, fontSize: 9.5 }}
            title={t('dtable.chartDlHint', '차트 SVG 파일 다운로드 (문서 첨부용)')}>⬇ SVG</button>
          <button className="b" data-chart-print onClick={printChart} style={{ height: 19, fontSize: 9.5 }}
            title={t('dtable.chartPrintHint', '차트 인쇄 — 새 창 + OS 인쇄 대화상자')}>🖶 {t('common.print', '인쇄')}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label><input type="radio" name="ckind" checked={kind === 'line'} onChange={() => setKind('line')} /> {t('dtable.line', '라인')}</label>
          <label><input type="radio" name="ckind" checked={kind === 'bar'} onChange={() => setKind('bar')} /> {t('dtable.bar', '막대')}</label>
        </div>
        <div style={{ color: 'var(--txt-dim)' }}>{t('dtable.seriesPick', '시리즈 (숫자 열)')}</div>
        {numericCols.map((c, i) => (
          <label key={c} data-chart-series style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={series.includes(c)} onChange={() => toggle(c)} />
            <span style={{ width: 8, height: 8, background: CHART_COLORS[i % CHART_COLORS.length], display: 'inline-block' }} />{c}
          </label>
        ))}
      </div>
      <svg ref={svgRef} data-chart-svg width={W} height={H} xmlns="http://www.w3.org/2000/svg" style={{ border: '1px solid var(--line)', background: '#fff', maxWidth: '100%' }} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = vMin + span * f
          const y = py(v)
          return (
            <g key={f}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#E3E7EE" />
              <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize={8.5} fill="#6B7686">{Math.round(v).toLocaleString()}</text>
            </g>
          )
        })}
        {data.map((d, i) => (
          <text key={d.key} x={kind === 'bar' ? PAD.l + (i + 0.5) * ((W - PAD.l - PAD.r) / Math.max(1, data.length)) : px(i)} y={H - 8}
            textAnchor="middle" fontSize={8.5} fill="#6B7686">{d.key}</text>
        ))}
        {series.map((c, si) => {
          const color = CHART_COLORS[numericCols.indexOf(c) % CHART_COLORS.length]
          if (kind === 'bar') {
            const gw = (W - PAD.l - PAD.r) / Math.max(1, data.length)
            return data.map((d, i) => {
              const v = d.vals[si]
              if (v == null) return null
              const x = PAD.l + i * gw + gw / 2 + (si - series.length / 2) * bw
              return <rect key={`${c}${d.key}`} x={x} y={Math.min(py(v), py(0))} width={bw - 1} height={Math.abs(py(v) - py(0))} fill={color} />
            })
          }
          const pts = data.map((d, i) => (d.vals[si] == null ? null : `${px(i)},${py(d.vals[si]!)}`)).filter(Boolean).join(' ')
          return <polyline key={c} points={pts} fill="none" stroke={color} strokeWidth={1.6} />
        })}
        {!series.length ? <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill="#9AA3B0">{t('dtable.noSeries', '시리즈를 선택하십시오')}</text> : null}
      </svg>
    </div>
  )
}
