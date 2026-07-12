/** C-2 CPQ 기술 데이터 (W-03) — 설계옵션 → Technical Data 범위조회(F8) → 선정. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { renderService, tableService } from '../../api/services'
import type { TechDataRow } from '../../api/types'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const DIRECTIONS = ['L0', 'L90', 'L180', 'L270', 'R0', 'R90', 'R180', 'R270']

export function TechDataScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell   // 안정 참조 — 재조회 루프 방지
  const { t } = useI18n()
  const [direction, setDirection] = useState('R0')
  const [airflow, setAirflow] = useState('2000')
  const [pressure, setPressure] = useState('200')
  const [model, setModel] = useState('KAD 1120 4KA-9')
  const [impeller, setImpeller] = useState('Carbon Steel · CL2')
  const [motor, setMotor] = useState('TEFC · Hyosung · 4P')
  const [rows, setRows] = useState<TechDataRow[]>([])
  const [selModel, setSelModel] = useState<string | null>(null)

  const query = useCallback(async () => {
    const r = await tableService.queryTechData(Number(airflow) || 0, Number(pressure) || 0)
    setRows(r)
    setSelModel(r[0]?.model ?? null)
    setStatusMsg(`Technical Data ${r.length}행 — 선정점 ${r[0]?.model ?? '—'}`)
  }, [airflow, pressure, setStatusMsg])

  useEffect(() => { void query() }, [query])

  useFKeys(active, useMemo(() => ({ F8: () => { void query() } }), [query]))

  const productCode = selModel ? `KAD-${selModel}-6-21-4-SR-7` : '—'
  const sel = rows.find((r) => r.model === selModel) ?? null

  // E1 — Fan 성능표 (PDF) 실생성 (선정 기술 데이터 + 후보 모델)
  const fanPerfPdf = () => {
    if (!sel) { setStatusMsg(<span style={{ color: 'var(--err)' }}>선정 모델을 먼저 선택하십시오</span>); return }
    const lines = [
      `선정점: ${sel.model} · ${sel.rpm} RPM · 효율 ${sel.eff}%`,
      `풍량 ${airflow} ㎥/min · 정압 ${pressure} mmAq · 방향 ${direction}`,
      `Pd ${sel.pd} · Pt ${sel.pt} · Power ${sel.power} kW · Sound ${sel.sound} dB`,
      '',
      '── 후보 모델 (Table 범위 조회) ──',
      'Model      Pd    Pt   RPM  Eff  Power Sound',
      ...rows.map((r) => `${r.model.padEnd(10)} ${String(r.pd).padStart(4)} ${String(r.pt).padStart(4)} ${String(r.rpm).padStart(4)} ${String(r.eff).padStart(4)} ${String(r.power).padStart(5)} ${String(r.sound).padStart(5)}`),
    ]
    void renderService.pdf(`Fan 성능표 — ${sel.model}`, lines, { subtitle: 'C-2 Technical Data (TBL-004) 실렌더' })
      .then((url) => {
        if (url) { window.open(url, '_blank'); setStatusMsg(`Fan 성능표 PDF ✓ — ${sel.model} 실렌더 (SVC-11)`) }
        else setStatusMsg(<span style={{ color: 'var(--err)' }}>렌더 불가 — 백엔드 연결 필요</span>)
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  // E1 — 밀도 보정 계산서 (PDF) 실생성 (습공기 밀도 근사 → 정압 보정)
  const densityPdf = () => {
    const rho = 1.293 * (273.15 / (273.15 + 20)) * (1 - 0.378 * 0.0234 * 0.8 / 101.325)
    const rhoR = Math.round(rho * 1000) / 1000
    const corrected = sel ? Math.round(sel.pt * (rhoR / 1.2) * 10) / 10 : null
    const lines = [
      '입력: 온도 20 ℃ · 상대습도 80 % · 대기압 101.325 kPa',
      `표준 밀도 ρ₀ = 1.2 kg/m³ · 계산 밀도 ρ = ${rhoR} kg/m³ (승인 Macro TBX-011)`,
      sel ? `정압 밀도 보정: Pt ${sel.pt} → ${corrected} mmAq (ρ/ρ₀ 비례)` : '(모델 미선정 — 보정 대상 없음)',
      '',
      'Document Templet(C-3) 밀도 계산서 표준 양식',
    ]
    void renderService.pdf('밀도 보정 계산서', lines, { subtitle: 'C-2 → C-3 Document Templet 연계' })
      .then((url) => {
        if (url) { window.open(url, '_blank'); setStatusMsg(`밀도 보정 계산서 PDF ✓ — ρ ${rhoR} kg/m³ (TBX-011)`) }
        else setStatusMsg(<span style={{ color: 'var(--err)' }}>렌더 불가 — 백엔드 연결 필요</span>)
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  // E1 — ＋ Add Item: BOM 항목은 Design Editor(code_relationship)에서 관리 → 실화면 이동
  const addItem = () => {
    shell.openTab({ screenId: 'plm-design', code: 'S-4-1-1', title: 'Design Editor' })
    setStatusMsg(`BOM 항목 추가 — Design Editor 로 이동 (${productCode} · code_relationship 관리)`)
  }

  // E1 — DWG View: 선정 Fan 도면을 Design Editor 도면 뷰로 전환
  const dwgView = (mode: string) => {
    shell.openTab({ screenId: 'plm-design', code: 'S-4-1-1', title: 'Design Editor' })
    setStatusMsg(`${mode} — 선정 Fan ${selModel ? `KAD ${selModel}` : ''} 도면 뷰 (Design Editor · CAD)`)
  }

  const cols: GridColumn<TechDataRow>[] = [
    { key: 'model', header: 'Model', width: 54, code: true, render: (r) => r.model },
    { key: 'pd', header: 'Pd', width: 44, align: 'right', render: (r) => r.pd },
    { key: 'pt', header: 'Pt', width: 44, align: 'right', render: (r) => r.pt },
    { key: 'rpm', header: 'RPM', width: 50, align: 'right', render: (r) => r.rpm },
    { key: 'eff', header: t('techdata.eff', '효율'), width: 44, align: 'right', render: (r) => r.eff },
    { key: 'power', header: 'Power', width: 50, align: 'right', render: (r) => r.power },
    { key: 'sound', header: 'Sound', width: 50, align: 'right', render: (r) => r.sound },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Fan Direction</label>
        {DIRECTIONS.map((d) => (
          <Btn key={d} variant={direction === d ? 'pri' : 'default'}
            onClick={() => setDirection(d)}>{d}</Btn>
        ))}
        <span className="sep" />
        <Combo width={110} value="DWG View" options={['DWG View', '3D View', 'Section']}
          onChange={dwgView} />
        <span style={{ flex: 1 }} />
        <Btn onClick={addItem}>＋ Add Item</Btn>
        <Btn variant="pri" onClick={() => void query()}>{t('techdata.queryF8', '조회 F8')}</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1, padding: 6, gap: 6, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 6 }}>
            <GroupBox title={t('techdata.selFanDrawing', '선정 Fan 도면 — {n}').replace('{n}', direction)}>
              <div className="cvs" style={{ height: 148 }}>
                <div className="m2 sel" style={{ left: 40, top: 24, width: 110, height: 90 }}>
                  Fan<small>{selModel ? `KAD ${selModel}` : '—'}</small>
                </div>
              </div>
            </GroupBox>
            <GroupBox title={t('techdata.designOptions', '설계 옵션 — 승인된 Sub Code 값만 (CODE-003)')}>
              <div className="frm">
                <label>Model</label>
                <Combo value={model} options={['KAD 1120 4KA-9', 'KAD 1000 4KA-7', 'KFD 900 2K']} onChange={setModel} />
                <label>Impeller</label>
                <Combo value={impeller} options={['Carbon Steel · CL2', 'Airfoil · SUS304']} onChange={setImpeller} />
                <label>Air Volume<i>*</i></label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="in req" style={{ width: 80 }} value={airflow} aria-label="Air Volume"
                    onChange={(e) => setAirflow(e.target.value)} />
                  <span className="unit">㎥/min</span>
                </div>
                <label>Motor</label>
                <Combo value={motor} options={['TEFC · Hyosung · 4P', 'TEAO · Hyundai · 2P']} onChange={setMotor} />
                <label>Static Pressure<i>*</i></label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="in req" style={{ width: 80 }} value={pressure} aria-label="Static Pressure"
                    onChange={(e) => setPressure(e.target.value)} />
                  <span className="unit">mmAq</span>
                </div>
                <label>Inlet cone</label>
                <Combo value="Airflow · IGV none" options={['Airflow · IGV none', 'IGV']} />
                <label>Temp / Humid</label>
                <input className="in" defaultValue="20 ℃ / 80 %" aria-label="Temp Humid" />
                <label>Casing</label>
                <Combo value="Steel S · Φ3 · 380V" options={['Steel S · Φ3 · 380V', 'SUS · Φ3 · 440V']} />
              </div>
            </GroupBox>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1, minHeight: 0 }}>
            <GroupBox title={t('techdata.techDataTitle', 'Technical Data — Table 범위 조회 + Macro (TBL-004)')} noPad>
              <DenseGrid columns={cols} rows={rows}
                rowKey={(r) => r.model} selectedKey={selModel}
                onRowClick={(r) => setSelModel(r.model)} />
            </GroupBox>
            <GroupBox title={t('techdata.perfCurve', '성능 곡선 — Pt·효율 (선정점 하이라이트)')}>
              <PerfCurve rows={rows} sel={sel} />
            </GroupBox>
          </div>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 300, display: 'flex', flexDirection: 'column', padding: 6, gap: 6 }}>
          <GroupBox title="Product Code" right={sel
            ? <Chip tone="ok">{t('techdata.valid', '유효')}</Chip>
            : <Chip tone="warn">{t('techdata.notSelected', '미선정')}</Chip>}>
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }}
              value={productCode} readOnly aria-label="Product Code" />
          </GroupBox>
          <GroupBox title="BOM" noPad right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }}
              onClick={() => shell.openTab({ id: 'cpq-run:tech', screenId: 'cpq-run', code: 'Run', title: '실행 (기술)' })}>
              ▶ EDIM Run
            </Btn>
          }>
            <table className="g">
              <tbody>
                <tr><td className="code">KDP 1-21-13-15</td><td>Casing</td><td className="num">1</td></tr>
                <tr><td className="code">H 22-380V</td><td>Motor</td><td className="num">1</td></tr>
                <tr><td className="code">KDP 9-32</td><td>Bearing</td><td className="num">4</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="Sub Item Technical data">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Btn style={{ height: 20, fontSize: 10 }} disabled={!sel} onClick={fanPerfPdf}>
                  📄 {t('techdata.fanPerfTable', 'Fan 성능표 (PDF)')} 생성
                </Btn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Btn style={{ height: 20, fontSize: 10 }} onClick={densityPdf}>
                  📄 {t('techdata.densityCalc', '밀도 보정 계산서')} 생성
                </Btn>
              </div>
              <div style={{ color: 'var(--txt-dim)' }}>
                {t('techdata.soundForecast', '소음 예측 (Sound {n} dB)').replace('{n}', String(sel?.sound ?? '—'))} <Chip tone="info">DRAFT</Chip>
              </div>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}

/** E1 — 성능 곡선 실 SVG: 후보 모델의 Pt(정압) 곡선 + 효율 곡선, 선정점 하이라이트. */
function PerfCurve({ rows, sel }: { rows: TechDataRow[]; sel: TechDataRow | null }) {
  if (rows.length === 0) {
    return (
      <div className="cvs" style={{ height: '100%', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--txt-mute)' }}>조회(F8) 후 선정점·성능 곡선 표시</span>
      </div>
    )
  }
  const W = 300, H = 150, PL = 30, PR = 30, PT = 12, PB = 22
  const iw = W - PL - PR, ih = H - PT - PB
  const n = rows.length
  const xs = (i: number) => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const pts = rows.map((r) => r.pt)
  const ptMin = Math.min(...pts), ptMax = Math.max(...pts)
  const ptSpan = ptMax - ptMin || 1
  const yPt = (v: number) => PT + ih - ((v - ptMin) / ptSpan) * ih
  const yEff = (v: number) => PT + ih - (v / 100) * ih   // 효율 0~100%
  const ptPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${yPt(r.pt).toFixed(1)}`).join(' ')
  const effPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${yEff(r.eff).toFixed(1)}`).join(' ')
  const selI = sel ? rows.indexOf(sel) : -1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ minHeight: 140 }} role="img" aria-label="성능 곡선">
      {/* 축 */}
      <line x1={PL} y1={PT} x2={PL} y2={PT + ih} stroke="var(--line)" />
      <line x1={PL} y1={PT + ih} x2={PL + iw} y2={PT + ih} stroke="var(--line)" />
      <text x={PL - 4} y={PT + 6} fontSize="7" textAnchor="end" fill="var(--txt-mute)">{ptMax}</text>
      <text x={PL - 4} y={PT + ih} fontSize="7" textAnchor="end" fill="var(--txt-mute)">{ptMin}</text>
      <text x={PL + iw} y={PT + ih + 14} fontSize="7.5" textAnchor="end" fill="var(--txt-mute)">Model →</text>
      {/* 효율 곡선 (보조) */}
      <path d={effPath} fill="none" stroke="#7FB2E8" strokeWidth="1" strokeDasharray="3 2" opacity="0.8" />
      {/* Pt 곡선 (주) */}
      <path d={ptPath} fill="none" stroke="var(--title-navy)" strokeWidth="1.6" />
      {rows.map((r, i) => (
        <g key={r.model}>
          <circle cx={xs(i)} cy={yPt(r.pt)} r={i === selI ? 4.5 : 2.5}
            fill={i === selI ? 'var(--err)' : 'var(--title-navy)'}
            stroke="#fff" strokeWidth={i === selI ? 1.5 : 0} />
          <text x={xs(i)} y={PT + ih + 9} fontSize="6.5" textAnchor="middle" fill="var(--txt-mute)">{r.model}</text>
        </g>
      ))}
      {sel ? (
        <text x={PL + 2} y={PT + 8} fontSize="8" fill="var(--err)" fontWeight="700">
          선정점 {sel.model} · Pt {sel.pt} · 효율 {sel.eff}% · {sel.rpm} RPM
        </text>
      ) : null}
      <text x={PL + iw} y={PT + 8} fontSize="6.5" textAnchor="end" fill="#7FB2E8">┈ 효율</text>
    </svg>
  )
}
