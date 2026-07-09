/** 정규화 DrawingDocument → SVG 렌더 (공용) — CAD 뷰어·C-1 구성 CAD·Design Editor CAD 에서 사용.
 *  인터랙션 내장: 휠 = 커서 기준 줌 · 드래그 = 이동(팬) · 더블클릭/⌂ = 맞춤 ·
 *  📏 측정(두 점 클릭 → 거리·Δ, 끝점/중심 스냅) · 엔티티 클릭 = 속성 조회(하이라이트+정보 패널). */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CadDocument, CadEntity } from '../api/services'

type VB = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }

function arcPath(e: CadEntity): string {
  const c = e.centerPoint!
  const r = e.radius!
  const a0 = (e.startAngleDegrees! * Math.PI) / 180
  const a1 = (e.endAngleDegrees! * Math.PI) / 180
  const x0 = c.x + r * Math.cos(a0)
  const y0 = c.y + r * Math.sin(a0)
  const x1 = c.x + r * Math.cos(a1)
  const y1 = c.y + r * Math.sin(a1)
  let sweep = e.endAngleDegrees! - e.startAngleDegrees!
  if (sweep < 0) sweep += 360
  const large = sweep > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** 점-선분 거리 */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

/** 엔티티까지의 거리 (도면 좌표) — 히트 테스트용 */
function entityDist(p: Pt, e: CadEntity): number {
  switch (e.entityType) {
    case 'line':
      return segDist(p, e.startPoint!, e.endPoint!)
    case 'polyline': {
      const v = e.vertexPoints!
      let d = Infinity
      for (let i = 0; i < v.length - 1; i++) d = Math.min(d, segDist(p, v[i], v[i + 1]))
      if (e.isClosed && v.length > 2) d = Math.min(d, segDist(p, v[v.length - 1], v[0]))
      return d
    }
    case 'circle':
      return Math.abs(dist(p, e.centerPoint!) - e.radius!)
    case 'arc': {
      const c = e.centerPoint!
      const ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
      const norm = (a: number) => ((a % 360) + 360) % 360
      const a0 = norm(e.startAngleDegrees!)
      let sweep = norm(e.endAngleDegrees! - e.startAngleDegrees!)
      if (sweep === 0) sweep = 360
      const rel = norm(ang - a0)
      if (rel <= sweep) return Math.abs(dist(p, c) - e.radius!)
      return Infinity
    }
    case 'text': {
      const ip = e.insertionPoint!
      const h = e.textHeight ?? 10
      const w = (e.textContent?.length ?? 1) * h * 0.62
      const dx = p.x < ip.x ? ip.x - p.x : p.x > ip.x + w ? p.x - ip.x - w : 0
      const dy = p.y < ip.y ? ip.y - p.y : p.y > ip.y + h ? p.y - ip.y - h : 0
      return Math.hypot(dx, dy)
    }
    default:
      return Infinity
  }
}

/** 스냅 후보점 — 끝점·정점·중심 */
function snapPoints(e: CadEntity): Pt[] {
  switch (e.entityType) {
    case 'line': return [e.startPoint!, e.endPoint!]
    case 'polyline': return e.vertexPoints!
    case 'circle': return [e.centerPoint!]
    case 'arc': {
      const c = e.centerPoint!
      const r = e.radius!
      const a0 = (e.startAngleDegrees! * Math.PI) / 180
      const a1 = (e.endAngleDegrees! * Math.PI) / 180
      return [c,
        { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) },
        { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }]
    }
    case 'text': return [e.insertionPoint!]
    default: return []
  }
}

/** 선택 엔티티 속성 요약 */
function entityInfo(e: CadEntity): { title: string; rows: [string, string][] } {
  const f = (n: number) => Number(n.toFixed(2)).toLocaleString()
  const pt = (p: Pt) => `(${f(p.x)}, ${f(p.y)})`
  switch (e.entityType) {
    case 'line': {
      const len = dist(e.startPoint!, e.endPoint!)
      return {
        title: 'LINE', rows: [
          ['레이어', e.layerName], ['길이', f(len)],
          ['시작', pt(e.startPoint!)], ['끝', pt(e.endPoint!)],
        ],
      }
    }
    case 'polyline': {
      const v = e.vertexPoints!
      let len = 0
      for (let i = 0; i < v.length - 1; i++) len += dist(v[i], v[i + 1])
      if (e.isClosed && v.length > 2) len += dist(v[v.length - 1], v[0])
      return {
        title: e.isClosed ? 'POLYLINE (닫힘)' : 'POLYLINE', rows: [
          ['레이어', e.layerName], ['정점', String(v.length)], ['총 길이', f(len)],
        ],
      }
    }
    case 'circle':
      return {
        title: 'CIRCLE', rows: [
          ['레이어', e.layerName], ['중심', pt(e.centerPoint!)],
          ['반지름', f(e.radius!)], ['둘레', f(2 * Math.PI * e.radius!)],
        ],
      }
    case 'arc': {
      let sweep = e.endAngleDegrees! - e.startAngleDegrees!
      if (sweep <= 0) sweep += 360
      return {
        title: 'ARC', rows: [
          ['레이어', e.layerName], ['중심', pt(e.centerPoint!)],
          ['반지름', f(e.radius!)], ['각도', `${f(sweep)}°`],
          ['호 길이', f((e.radius! * sweep * Math.PI) / 180)],
        ],
      }
    }
    case 'text':
      return {
        title: 'TEXT', rows: [
          ['레이어', e.layerName], ['내용', e.textContent ?? ''],
          ['높이', f(e.textHeight ?? 10)], ['삽입점', pt(e.insertionPoint!)],
        ],
      }
    default:
      return { title: String(e.entityType).toUpperCase(), rows: [['레이어', e.layerName]] }
  }
}

export function CadSvg(props: {
  doc: CadDocument
  hiddenLayers?: Set<string>
}) {
  const { doc } = props
  const hidden = props.hiddenLayers ?? new Set<string>()

  // 맞춤(fit) 뷰박스 — SVG 는 y-반전 그룹으로 그리므로 y 는 [-maxY, -minY]
  const fit = useMemo<VB>(() => {
    const { minX, minY, maxX, maxY } = doc.bounds
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const mx = w * 0.05 + 10
    const my = h * 0.05 + 10
    return { x: minX - mx, y: -maxY - my, w: w + mx * 2, h: h + my * 2 }
  }, [doc])

  const [vb, setVb] = useState<VB | null>(null) // null = 맞춤
  const view = vb ?? fit
  const svgRef = useRef<SVGSVGElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const fitRef = useRef(fit)
  fitRef.current = fit
  const drag = useRef<{ px: number; py: number; vb: VB; scale: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  // 측정·조회 상태 (도면 좌표)
  const [measureOn, setMeasureOn] = useState(false)
  const measureRef = useRef(measureOn)
  measureRef.current = measureOn
  const [m1, setM1] = useState<Pt | null>(null)
  const [m2, setM2] = useState<Pt | null>(null)
  const [mHover, setMHover] = useState<Pt | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const selected = useMemo(
    () => doc.entities.find((e) => e.entityId === selId) ?? null, [doc, selId])

  // 문서 변경 시 측정·선택 초기화
  useEffect(() => { setM1(null); setM2(null); setMHover(null); setSelId(null) }, [doc])

  // client px → 도면 단위 스케일 (preserveAspectRatio=meet 기준)
  const pxScale = (v: VB) => {
    const r = svgRef.current!.getBoundingClientRect()
    return Math.max(v.w / r.width, v.h / r.height)
  }

  /** client 좌표 → 도면 좌표 (y-반전 반영) */
  const toDrawing = (clientX: number, clientY: number): Pt => {
    const el = svgRef.current!
    const v = viewRef.current
    const r = el.getBoundingClientRect()
    const s = Math.max(v.w / r.width, v.h / r.height)
    const ox = r.left + (r.width - v.w / s) / 2
    const oy = r.top + (r.height - v.h / s) / 2
    const sx = v.x + (clientX - ox) * s
    const sy = v.y + (clientY - oy) * s
    return { x: sx, y: -sy }
  }

  const visibleEntities = useMemo(
    () => doc.entities.filter((e) => !hidden.has(e.layerName)),
    [doc, hidden])

  /** 스냅 — 화면 10px 이내 끝점/정점/중심 */
  const snap = (p: Pt): Pt => {
    const tol = pxScale(viewRef.current) * 10
    let best: Pt | null = null
    let bd = tol
    for (const e of visibleEntities) {
      for (const c of snapPoints(e)) {
        const d = dist(p, c)
        if (d < bd) { bd = d; best = c }
      }
    }
    return best ?? p
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = svgRef.current
    if (!el) return
    const v = viewRef.current
    const f = fitRef.current
    const r = el.getBoundingClientRect()
    const s = Math.max(v.w / r.width, v.h / r.height)
    const ox = r.left + (r.width - v.w / s) / 2
    const oy = r.top + (r.height - v.h / s) / 2
    const px = v.x + (clientX - ox) * s
    const py = v.y + (clientY - oy) * s
    const k = Math.min(Math.max(v.w * factor, f.w / 100), f.w * 10) / v.w
    setVb({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: v.w * k, h: v.h * k })
  }

  const zoomCenter = (factor: number) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  // React 합성 onWheel 은 passive → 네이티브 리스너로 preventDefault
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      zoomAt(ev.clientX, ev.clientY, Math.exp(ev.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc.layers.forEach((l) => {
      m[l.layerName] = l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex
    })
    return m
  }, [doc])

  // 화면상 선 굵기 일정 유지 — 현재 뷰 크기에 비례
  const strokeW = Math.max(view.w, view.h) / 500
  const px = (n: number) => n * Math.max(view.w, view.h) / 700 // 화면 px 근사 → 도면 단위

  /** 클릭 위치의 엔티티 조회 (화면 8px 허용) */
  const pick = (p: Pt): CadEntity | null => {
    const tol = pxScale(viewRef.current) * 8
    let best: CadEntity | null = null
    let bd = tol
    for (const e of visibleEntities) {
      const d = entityDist(p, e)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  const handleClick = (clientX: number, clientY: number) => {
    const p = toDrawing(clientX, clientY)
    if (measureRef.current) {
      const sp = snap(p)
      if (m1 === null || m2 !== null) { setM1(sp); setM2(null); setMHover(null) }
      else setM2(sp)
    } else {
      setSelId(pick(p)?.entityId ?? null)
    }
  }

  const render = (e: CadEntity, isSel: boolean) => {
    const color = isSel ? '#D97706' : (layerColor[e.layerName] ?? '#2B3A55')
    const common = {
      stroke: color, strokeWidth: isSel ? strokeW * 2.5 : strokeW, fill: 'none' as const,
    }
    switch (e.entityType) {
      case 'line':
        return <line key={e.entityId} x1={e.startPoint!.x} y1={e.startPoint!.y}
          x2={e.endPoint!.x} y2={e.endPoint!.y} {...common} />
      case 'polyline': {
        const pts = e.vertexPoints!.map((p) => `${p.x},${p.y}`).join(' ')
        return e.isClosed
          ? <polygon key={e.entityId} points={pts} {...common} />
          : <polyline key={e.entityId} points={pts} {...common} />
      }
      case 'circle':
        return <circle key={e.entityId} cx={e.centerPoint!.x} cy={e.centerPoint!.y}
          r={e.radius!} {...common} />
      case 'arc':
        return <path key={e.entityId} d={arcPath(e)} {...common} />
      case 'text':
        return (
          <text key={e.entityId} x={e.insertionPoint!.x} y={-e.insertionPoint!.y}
            fontSize={e.textHeight ?? 10} fill={color}
            transform={`scale(1,-1)${e.rotationDegrees
              ? ` rotate(${-e.rotationDegrees} ${e.insertionPoint!.x} ${-e.insertionPoint!.y})` : ''}`}
            fontFamily="Consolas, monospace">
            {e.textContent}
          </text>
        )
      default:
        return null
    }
  }

  const zoomPct = Math.round((fit.w / view.w) * 100)
  const btn: CSSProperties = {
    width: 22, height: 22, padding: 0, border: '1px solid var(--line)',
    background: '#fff', color: 'var(--txt)', fontSize: 12, lineHeight: '20px',
    cursor: 'pointer', borderRadius: 2,
  }
  const info = selected ? entityInfo(selected) : null

  // 측정 오버레이 좌표 (도면 → SVG: y 부호 반전)
  const mEnd = m2 ?? mHover
  const measureLabel = m1 && mEnd
    ? `${Number(dist(m1, mEnd).toFixed(2)).toLocaleString()}  (Δx ${Number(Math.abs(mEnd.x - m1.x).toFixed(2)).toLocaleString()} · Δy ${Number(Math.abs(mEnd.y - m1.y).toFixed(2)).toLocaleString()})`
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        data-cad-svg
        style={{
          display: 'block', touchAction: 'none',
          cursor: measureOn ? 'crosshair' : dragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            px: e.clientX, py: e.clientY, vb: viewRef.current,
            scale: pxScale(viewRef.current), moved: false,
          }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) {
            if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) d.moved = true
            if (d.moved) setVb({
              ...d.vb,
              x: d.vb.x - (e.clientX - d.px) * d.scale,
              y: d.vb.y - (e.clientY - d.py) * d.scale,
            })
          } else if (measureRef.current && m1 !== null && m2 === null) {
            setMHover(snap(toDrawing(e.clientX, e.clientY)))
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          setDragging(false)
          if (d && !d.moved) handleClick(e.clientX, e.clientY)
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false) }}
        onDoubleClick={() => { if (!measureRef.current) setVb(null) }}>
        <g transform="scale(1,-1)">
          {visibleEntities.filter((e) => e.entityId !== selId).map((e) => render(e, false))}
          {selected && !hidden.has(selected.layerName) ? render(selected, true) : null}
        </g>
        {/* 측정 오버레이 — 도면 좌표 (y 부호 반전) */}
        {m1 && mEnd ? (
          <g data-cad-measure>
            <line x1={m1.x} y1={-m1.y} x2={mEnd.x} y2={-mEnd.y}
              stroke="#B3372F" strokeWidth={strokeW * 1.4} strokeDasharray={`${px(6)} ${px(4)}`} />
            <circle cx={m1.x} cy={-m1.y} r={px(3.5)} fill="#B3372F" />
            <circle cx={mEnd.x} cy={-mEnd.y} r={px(3.5)} fill={m2 ? '#B3372F' : 'none'}
              stroke="#B3372F" strokeWidth={strokeW * 1.4} />
          </g>
        ) : m1 ? (
          <circle cx={m1.x} cy={-m1.y} r={px(3.5)} fill="#B3372F" data-cad-measure />
        ) : null}
      </svg>
      {/* 우상단 — 줌·측정 컨트롤 */}
      <div style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3,
        alignItems: 'center', userSelect: 'none',
      }}>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)', background: '#ffffffcc', padding: '2px 5px', borderRadius: 2 }}>
          {zoomPct}%
        </span>
        <button type="button" style={btn} title="확대" data-cad-zoom-in
          onClick={() => zoomCenter(1 / 1.4)}>＋</button>
        <button type="button" style={btn} title="축소" data-cad-zoom-out
          onClick={() => zoomCenter(1.4)}>－</button>
        <button type="button" style={btn} title="맞춤 (더블클릭)" data-cad-fit
          onClick={() => setVb(null)}>⌂</button>
        <button type="button" data-cad-measure-toggle
          style={{
            ...btn, width: 'auto', padding: '0 7px', fontSize: 10.5,
            ...(measureOn ? { background: '#B3372F', color: '#fff', borderColor: '#B3372F' } : {}),
          }}
          title="측정 — 두 점 클릭 (끝점·중심 스냅)"
          onClick={() => {
            const next = !measureOn
            setMeasureOn(next)
            if (!next) { setM1(null); setM2(null); setMHover(null) }
          }}>📏 측정</button>
      </div>
      {/* 좌하단 — 측정 결과 / 엔티티 속성 */}
      {measureLabel ? (
        <div data-cad-measure-label style={{
          position: 'absolute', bottom: 6, left: 8, fontSize: 11,
          fontFamily: 'Consolas, monospace', color: '#B3372F', background: '#ffffffee',
          border: '1px solid #B3372F', padding: '3px 8px', borderRadius: 2, userSelect: 'none',
        }}>
          📏 {measureLabel}{m2 ? '' : ' …'}
        </div>
      ) : info ? (
        <div data-cad-entity-info style={{
          position: 'absolute', bottom: 6, left: 8, fontSize: 10.5,
          background: '#ffffffee', border: '1px solid var(--line)', borderRadius: 2,
          padding: '5px 9px', minWidth: 170, lineHeight: 1.7, userSelect: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <b style={{ color: '#D97706' }}>{info.title}</b>
            <span style={{ flex: 1 }} />
            <span style={{ cursor: 'pointer', color: 'var(--txt-mute)' }}
              onClick={() => setSelId(null)}>✕</span>
          </div>
          {info.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--txt-mute)', width: 44, flex: 'none' }}>{k}</span>
              <span style={{ fontFamily: 'Consolas, monospace' }}>{v}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{
        position: 'absolute', bottom: 6, right: 8, fontSize: 10,
        color: 'var(--txt-mute)', background: '#ffffffcc', padding: '2px 6px',
        borderRadius: 2, pointerEvents: 'none', userSelect: 'none',
      }}>
        {measureOn ? '두 점 클릭 = 거리 측정 · 끝점/중심 자동 스냅' : '휠 줌 · 드래그 이동 · 더블클릭 맞춤 · 클릭 = 속성'}
      </div>
    </div>
  )
}
