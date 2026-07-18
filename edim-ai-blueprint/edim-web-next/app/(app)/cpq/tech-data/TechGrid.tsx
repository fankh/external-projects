'use client'

/** Tech Data (C-2) — 성능 범위 조회 + 선정 모델 PDF 발급 (N5b 복구). */
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'
import { openRenderedPdf } from '@/lib/pdf'

export interface TechDataRow { model: string; pd: number; pt: number; rpm: number; eff: number; power: number; sound: number }

const num = (v: number, d = 0) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

export function TechGrid({ rows, airflow, pressure }: { rows: TechDataRow[]; airflow: number; pressure: number }) {
  const router = useRouter()
  const { t } = useI18n()
  const cols: GridColumn<TechDataRow>[] = [
    { key: 'model', header: t('techdata.model', '모델'), width: 96, code: true, render: (r) => r.model },
    { key: 'pd', header: t('techdata.staticPd', '정압 Pd'), width: 80, align: 'right', sortValue: (r) => r.pd, render: (r) => num(r.pd) },
    { key: 'pt', header: t('techdata.totalPt', '전압 Pt'), width: 80, align: 'right', sortValue: (r) => r.pt, render: (r) => num(r.pt) },
    { key: 'rpm', header: 'RPM', width: 72, align: 'right', sortValue: (r) => r.rpm, render: (r) => num(r.rpm) },
    { key: 'eff', header: `${t('techdata.eff', '효율')} %`, width: 70, align: 'right', sortValue: (r) => r.eff, render: (r) => num(r.eff, 1) },
    { key: 'power', header: `${t('techdata.power', '동력')} kW`, width: 78, align: 'right', sortValue: (r) => r.power, render: (r) => num(r.power, 2) },
    { key: 'sound', header: `${t('techdata.sound', '소음')} dB`, width: 76, align: 'right', sortValue: (r) => r.sound, render: (r) => num(r.sound, 1) },
  ]
  const sp = useSearchParams()
  const [selModel, setSelModel] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const sel = rows.find((r) => r.model === selModel) ?? null
  const go = (a: number, p: number) => router.push(`/cpq/tech-data?airflow=${a}&pressure=${p}`)
  const onKey = (key: 'airflow' | 'pressure') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const v = Number((e.target as HTMLInputElement).value) || 0
    const a = key === 'airflow' ? v : Number(sp.get('airflow')) || airflow
    const p = key === 'pressure' ? v : Number(sp.get('pressure')) || pressure
    go(a, p)
  }

  // E1 — Fan 성능표 PDF (선정 모델 + 후보 목록 실렌더)
  const fanPerfPdf = async () => {
    if (!sel) { setMsg({ text: '선정 모델을 먼저 클릭하십시오', err: true }); return }
    const lines = [
      `선정점: ${sel.model} · ${sel.rpm} RPM · 효율 ${sel.eff}%`,
      `풍량 ${airflow} CMH · 정압 ${pressure} Pa`,
      `Pd ${sel.pd} · Pt ${sel.pt} · Power ${sel.power} kW · Sound ${sel.sound} dB`,
      '', '── 후보 모델 (Table 범위 조회) ──',
      'Model      Pd    Pt   RPM  Eff  Power Sound',
      ...rows.map((r) => `${r.model.padEnd(10)} ${String(r.pd).padStart(4)} ${String(r.pt).padStart(4)} ${String(r.rpm).padStart(4)} ${String(r.eff).padStart(4)} ${String(r.power).padStart(5)} ${String(r.sound).padStart(5)}`),
    ]
    const ok = await openRenderedPdf(`Fan 성능표 — ${sel.model}`, lines, { subtitle: 'C-2 Technical Data (TBL-004) 실렌더' })
    setMsg(ok ? { text: `Fan 성능표 PDF ✓ — ${sel.model}` } : { text: '렌더 불가 — 백엔드 연결 필요', err: true })
  }

  // E1 — 밀도 보정 계산서 PDF (습공기 근사 → 정압 보정)
  const densityPdf = async () => {
    const rho = 1.293 * (273.15 / (273.15 + 20)) * (1 - 0.378 * 0.0234 * 0.8 / 101.325)
    const rhoR = Math.round(rho * 1000) / 1000
    const corrected = sel ? Math.round(sel.pt * (rhoR / 1.2) * 10) / 10 : null
    const lines = [
      '입력: 온도 20 ℃ · 상대습도 80 % · 대기압 101.325 kPa',
      `표준 밀도 ρ₀ = 1.2 kg/m³ · 계산 밀도 ρ = ${rhoR} kg/m³ (승인 Macro TBX-011)`,
      sel ? `정압 밀도 보정: Pt ${sel.pt} → ${corrected} (ρ/ρ₀ 비례)` : '(모델 미선정 — 보정 대상 없음)',
      '', 'Document Templet(C-3) 밀도 계산서 표준 양식',
    ]
    const ok = await openRenderedPdf('밀도 보정 계산서', lines, { subtitle: 'C-2 → C-3 Document Templet 연계' })
    setMsg(ok ? { text: `밀도 보정 계산서 PDF ✓ — ρ ${rhoR} kg/m³` } : { text: '렌더 불가 — 백엔드 연결 필요', err: true })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>{t('cpq.airflow', '풍량')} CMH</label>
        <input className="in" defaultValue={airflow} onKeyDown={onKey('airflow')} style={{ height: 22, fontSize: 11, width: 84 }} />
        <label style={{ fontSize: 11 }}>{t('cpq.pressure', '정압')} Pa</label>
        <input className="in" defaultValue={pressure} onKeyDown={onKey('pressure')} style={{ height: 22, fontSize: 11, width: 72 }} />
        <span className="sep" />
        <button className="b" onClick={() => void fanPerfPdf()}>🖶 {t('techdata.fanPerfPdf', 'Fan 성능표 PDF')}{sel ? ` (${sel.model})` : ''}</button>
        <button className="b" onClick={() => void densityPdf()}>🖶 {t('techdata.densityPdf', '밀도 계산서 PDF')}</button>
        {msg ? <span style={{ fontSize: 11, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</span>
          : <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('techdata.rowHint', '행 클릭=선정 · Enter 재조회')}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DenseGrid prefKey="next-techdata" colFilter columns={cols} rows={rows} rowKey={(r) => r.model}
            selectedKey={selModel ?? undefined} onRowClick={(r) => setSelModel(r.model)}
            emptyText={t('techdata.noData', '해당 조건의 성능 데이터가 없습니다')} />
        </div>
        {rows.length >= 2 ? <PerfCurve rows={rows} selModel={selModel} onSelect={setSelModel} /> : null}
      </div>
    </div>
  )
}

/** U15 — 성능 곡선 SVG (슬라이드 7·8) — 모델별 전압 Pt(실선)·효율(점선) 비교, 클릭=선정. */
function PerfCurve({ rows, selModel, onSelect }: { rows: TechDataRow[]; selModel: string | null; onSelect: (m: string) => void }) {
  const { t } = useI18n()
  const W = 330, H = 240, PAD = { l: 38, r: 34, t: 14, b: 34 }
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const sorted = [...rows].sort((a, b) => a.model.localeCompare(b.model, undefined, { numeric: true }))
  const ptMax = Math.max(...sorted.map((r) => r.pt)) * 1.1 || 1
  const x = (i: number) => PAD.l + (sorted.length === 1 ? iw / 2 : (i * iw) / (sorted.length - 1))
  const yPt = (v: number) => PAD.t + ih - (v / ptMax) * ih
  const yEff = (v: number) => PAD.t + ih - (v / 100) * ih
  const ptPath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yPt(r.pt).toFixed(1)}`).join(' ')
  const effPath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yEff(r.eff).toFixed(1)}`).join(' ')
  return (
    <div className="gb" data-perf-curve style={{ width: W + 16, flexShrink: 0, padding: 8, fontSize: 10.5, overflow: 'auto' }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>{t('techdata.curveTitle', '성능 곡선')} — Pt · {t('techdata.eff', '효율')}</div>
      <svg width={W} height={H} style={{ display: 'block', background: '#fff', border: '1px solid var(--line)' }}>
        {/* 격자 + 축 */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * f} y2={PAD.t + ih * f} stroke="#EDF1F7" />
            <text x={PAD.l - 4} y={PAD.t + ih * f + 3} fontSize={8} textAnchor="end" fill="#8A93A6">{Math.round(ptMax * (1 - f))}</text>
            <text x={W - PAD.r + 4} y={PAD.t + ih * f + 3} fontSize={8} fill="#2F9463">{Math.round(100 * (1 - f))}%</text>
          </g>
        ))}
        <path d={ptPath} fill="none" stroke="#1F4E8C" strokeWidth={1.6} />
        <path d={effPath} fill="none" stroke="#2F9463" strokeWidth={1.3} strokeDasharray="4 3" />
        {sorted.map((r, i) => (
          <g key={r.model} style={{ cursor: 'pointer' }} onClick={() => onSelect(r.model)}>
            <circle cx={x(i)} cy={yPt(r.pt)} r={r.model === selModel ? 5 : 3}
              fill={r.model === selModel ? '#C0392B' : '#1F4E8C'} />
            <circle cx={x(i)} cy={yEff(r.eff)} r={r.model === selModel ? 4 : 2.5} fill="#2F9463" opacity={0.85} />
            <text x={x(i)} y={H - PAD.b + 12} fontSize={8} textAnchor="middle"
              fill={r.model === selModel ? '#C0392B' : '#5B6472'}
              fontWeight={r.model === selModel ? 700 : 400}
              transform={sorted.length > 6 ? `rotate(-35 ${x(i)} ${H - PAD.b + 12})` : undefined}>{r.model}</text>
          </g>
        ))}
        <text x={PAD.l} y={10} fontSize={8.5} fill="#1F4E8C">— Pt (Pa)</text>
        <text x={PAD.l + 70} y={10} fontSize={8.5} fill="#2F9463">- - {t('techdata.eff', '효율')} (%)</text>
      </svg>
      <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>{t('techdata.curveHint', '점 클릭 = 모델 선정 (선정점 적색)')}</div>
    </div>
  )
}
