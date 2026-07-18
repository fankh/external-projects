'use client'

/** 건축설비 Duct (M-4-3, U8 심화) — 층 선택·자동 배치 캔버스 + 기술계산표(압력손실·Leak·결로·하중·풍량 비교) + Duct BOM→구매 연결.
 *  계산은 표준 근사식(마찰 f=0.019·ρ=1.2·SMACNA Class C 근사·아연도 0.8T 6.28kg/m²) — 근거를 표기하고 PDF 계산서 발급. */
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CadSvg } from '@/components/CadSvg'
import { GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { openRenderedPdf } from '@/lib/pdf'
import type { CadDocument, CadEntity } from '@/lib/cadTypes'

const FLOORS = ['1F', '2F', '3F', 'RF']

function entityLength(e: CadEntity): number {
  if (e.entityType === 'line' && e.startPoint && e.endPoint) {
    return Math.hypot(e.endPoint.x - e.startPoint.x, e.endPoint.y - e.startPoint.y)
  }
  if (e.entityType === 'polyline' && e.vertexPoints && e.vertexPoints.length > 1) {
    let s = 0
    for (let i = 1; i < e.vertexPoints.length; i++) {
      s += Math.hypot(e.vertexPoints[i].x - e.vertexPoints[i - 1].x, e.vertexPoints[i].y - e.vertexPoints[i - 1].y)
    }
    return s
  }
  return 0
}

/** Magnus 근사 노점 (℃). */
function dewPoint(tempC: number, rhPct: number): number {
  const a = 17.27, b = 237.7
  const g = (a * tempC) / (b + tempC) + Math.log(Math.max(1, rhPct) / 100)
  return (b * g) / (a - g)
}

export function DuctCanvas({ doc, diffusers, floor }: { doc: CadDocument; diffusers: number; floor: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const sp = useSearchParams()
  const [edit, setEdit] = useState(false)

  const nav = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) q.set(k, v)
    router.push(`/plm/duct?${q.toString()}`)
  }

  // ── 기술계산 입력 (U8 슬라이드 68 [설정]) ──
  const [airflow, setAirflow] = useState(3000)   // 장비 풍량 CMH
  const [dw, setDw] = useState(400)              // 덕트 폭 mm
  const [dh, setDh] = useState(300)              // 덕트 높이 mm
  const [temp, setTemp] = useState(20)           // 실내 온도 ℃
  const [rh, setRh] = useState(60)               // 상대습도 %
  const [supplyT, setSupplyT] = useState(16)     // 급기(표면 근사) 온도 ℃
  const [perDiff, setPerDiff] = useState(500)    // 디퓨저당 설계 풍량 CMH

  const calc = useMemo(() => {
    const lenMm = doc.entities.reduce((s, e) => s + entityLength(e), 0)
    const L = lenMm / 1000                                     // m (도면 단위 mm 가정)
    const A = (dw / 1000) * (dh / 1000)                        // m²
    const V = A > 0 ? airflow / 3600 / A : 0                   // m/s
    const Dh = (2 * dw * dh) / (dw + dh) / 1000                // 수력지름 m
    const dP = Dh > 0 ? 0.019 * (L / Dh) * (1.2 * V * V / 2) : 0   // Pa (f=0.019·ρ=1.2)
    const S = (2 * (dw + dh) / 1000) * L                       // 표면적 m²
    const leakLs = 0.016 * S * Math.pow(Math.max(dP, 1), 0.65) // SMACNA Class C 근사 l/s
    const leakPct = airflow > 0 ? (leakLs * 3.6 / airflow) * 100 : 0
    const weight = S * 6.28                                    // 아연도 0.8T kg
    const hangers = Math.max(1, Math.ceil(L / 2))              // 2m 간격
    const hangerLoad = weight / hangers
    const td = dewPoint(temp, rh)
    const condensation = supplyT < td
    const designFlow = diffusers * perDiff
    const flowDevPct = airflow > 0 ? ((designFlow - airflow) / airflow) * 100 : 0
    return { L, V, dP, S, leakPct, weight, hangers, hangerLoad, td, condensation, designFlow, flowDevPct }
  }, [doc, airflow, dw, dh, temp, rh, supplyT, diffusers, perDiff])

  const fmt = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

  const calcPdf = async () => {
    const lines = [
      `층 ${floor} · Diffuser ${diffusers} · 덕트 ${dw}×${dh}mm · 총 길이 ${fmt(calc.L)} m`,
      `풍량 ${airflow} CMH → 유속 ${fmt(calc.V, 2)} m/s (권장 5~7)`,
      `압력손실 ΔP = ${fmt(calc.dP)} Pa  (f=0.019 · ρ=1.2 · Dh 기준)`,
      `Leak율 ≈ ${fmt(calc.leakPct, 2)} %  (SMACNA Class C 근사 · 표면적 ${fmt(calc.S)} m²)`,
      `결로: 노점 ${fmt(calc.td)} ℃ vs 급기 ${supplyT} ℃ → ${calc.condensation ? '위험 (보온 필요)' : '안전'}`,
      `하중: 덕트 자중 ${fmt(calc.weight)} kg (아연도 0.8T) · 행거 ${calc.hangers}개 · 행거당 ${fmt(calc.hangerLoad)} kg`,
      `풍량 비교: 설계 ${calc.designFlow} CMH (${diffusers}×${perDiff}) vs 장비 ${airflow} CMH → 편차 ${fmt(calc.flowDevPct)} %`,
      '', '근사식 기반 기술 검토 자료 — 최종 설계는 상세 계산 필요 (DUCT-004)',
    ]
    await openRenderedPdf(`Duct 기술계산표 — ${floor}`, lines, { subtitle: '건축설비 Design (M-4-3, 슬라이드 68 기술자료)' })
  }

  // ── Duct BOM (U8 — EDIM 연결: 구매) ──
  const bom = useMemo(() => ([
    { item: `직관 덕트 ${dw}×${dh}`, qty: `${fmt(calc.L)} m`, remarks: '아연도 0.8T' },
    { item: 'Diffuser', qty: `${diffusers} EA`, remarks: `${perDiff} CMH/EA` },
    { item: '플렉시블 연결관', qty: `${diffusers} EA`, remarks: 'Diffuser 접속' },
    { item: '행거 세트', qty: `${calc.hangers} SET`, remarks: '2m 간격' },
    { item: '보온재 (G/Wool 25T)', qty: `${fmt(calc.S)} m²`, remarks: calc.condensation ? '결로 위험 — 필수' : '선택' },
  ]), [calc, dw, dh, diffusers, perDiff])

  const numIn = (v: number, set: (n: number) => void, w = 56) => (
    <input className="in" type="number" value={v} style={{ width: w, height: 18, fontSize: 10, textAlign: 'right' }}
      onChange={(e) => set(Number(e.target.value) || 0)} />
  )

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{t('duct.canvasTitle', 'Duct 자동 배치 — CAD 실엔진 (SSR)')}</span>
        {/* U8 — 층 선택 */}
        <label style={{ fontSize: 11 }}>{t('duct.floor', '층')}</label>
        <select className="in" data-duct-floor value={floor} onChange={(e) => nav({ floor: e.target.value })} style={{ height: 20, fontSize: 10.5 }}>
          {FLOORS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="chip ok">Diffuser {diffusers}</span>
        <button type="button" className="b" style={{ height: 18, fontSize: 10 }} onClick={() => nav({ diffusers: String(Math.max(1, diffusers - 1)) })}>−</button>
        <button type="button" className="b" style={{ height: 18, fontSize: 10 }} onClick={() => nav({ diffusers: String(Math.min(12, diffusers + 1)) })}>＋ Diffuser</button>
        <button type="button" className={`b ${edit ? 'pri' : ''}`} style={{ height: 18, fontSize: 10 }} onClick={() => setEdit((e) => !e)}>✎ {t('common.edit', '편집')}</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('duct.entity', '엔티티')} {doc.entities.length}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CadSvg doc={doc} editable={edit} />
        </div>
        {/* U8 — 기술계산표 + BOM 패널 */}
        <div data-duct-calc style={{ width: 300, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 6px 6px 0' }}>
          <GroupBox title={t('duct.calcTitle', '기술계산표 (슬라이드 68)')} noPad>
            <div style={{ padding: 6, fontSize: 10.5, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4, alignItems: 'center' }}>
              <label>{t('duct.airflow', '장비 풍량')} CMH</label>{numIn(airflow, setAirflow)}
              <label>{t('duct.size', '덕트 W×H')} mm</label>
              <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{numIn(dw, setDw, 48)}×{numIn(dh, setDh, 48)}</span>
              <label>{t('duct.airCond', '온도/습도')}</label>
              <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{numIn(temp, setTemp, 40)}℃ {numIn(rh, setRh, 40)}%</span>
              <label>{t('duct.supplyT', '급기 온도')} ℃</label>{numIn(supplyT, setSupplyT, 40)}
              <label>{t('duct.perDiff', '디퓨저당')} CMH</label>{numIn(perDiff, setPerDiff)}
            </div>
            <table className="g" style={{ width: '100%', fontSize: 10 }}>
              <tbody>
                <tr><td>{t('duct.totalLen', '덕트 총 길이')}</td><td className="c"><b>{fmt(calc.L)} m</b></td></tr>
                <tr><td>{t('duct.velocity', '유속')}</td><td className="c" style={{ color: calc.V > 7 ? 'var(--err)' : undefined }}>{fmt(calc.V, 2)} m/s</td></tr>
                <tr><td>{t('duct.pressureLoss', '압력손실')} ΔP</td><td className="c"><b>{fmt(calc.dP)} Pa</b></td></tr>
                <tr><td>Leak율 (Class C)</td><td className="c">{fmt(calc.leakPct, 2)} %</td></tr>
                <tr><td>{t('duct.condensation', '결로')} ({t('duct.dewPoint', '노점')} {fmt(calc.td)}℃)</td>
                  <td className="c" style={{ fontWeight: 700, color: calc.condensation ? 'var(--err)' : 'var(--run)' }}>{calc.condensation ? t('duct.risk', '위험') : t('duct.safe', '안전')}</td></tr>
                <tr><td>{t('duct.load', '하중')} ({calc.hangers} {t('duct.hanger', '행거')})</td><td className="c">{fmt(calc.weight)} kg · {fmt(calc.hangerLoad)} kg/{t('duct.hanger', '행거')}</td></tr>
                <tr><td>{t('duct.flowCompare', '풍량 비교')}</td>
                  <td className="c" style={{ color: Math.abs(calc.flowDevPct) > 10 ? 'var(--warn, #B4820B)' : undefined }}>{calc.designFlow} CMH ({fmt(calc.flowDevPct)}%)</td></tr>
              </tbody>
            </table>
            <div style={{ padding: 6 }}>
              <button className="b" data-duct-pdf style={{ height: 20, fontSize: 10 }} onClick={() => void calcPdf()}>🖶 {t('duct.calcPdf', '계산서 PDF')}</button>
            </div>
          </GroupBox>
          <GroupBox title={`Duct BOM — ${t('duct.purchaseLink', '구매 연결')}`} noPad>
            <table className="g" style={{ width: '100%', fontSize: 10 }} data-duct-bom>
              <thead><tr><th>{t('duct.bomItem', '품목')}</th><th>{t('inv.qty', '수량')}</th><th>{t('wh.remarks', '비고')}</th></tr></thead>
              <tbody>{bom.map((b) => (
                <tr key={b.item}><td>{b.item}</td><td className="c">{b.qty}</td><td style={{ fontSize: 9 }}>{b.remarks}</td></tr>
              ))}</tbody>
            </table>
            <div style={{ padding: 6, display: 'flex', gap: 4 }}>
              <button className="b" style={{ height: 20, fontSize: 10 }} onClick={() => router.push('/erp/purchase')}>{t('duct.toPr', '자재발주요청 (PR) 화면')}</button>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
