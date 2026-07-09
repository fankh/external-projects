/** 정규화 DrawingDocument → SVG 렌더 (공용) — CAD 뷰어·C-1 구성 CAD·Design Editor CAD 에서 사용.
 *  인터랙션 내장: 휠 = 커서 기준 줌 · 드래그 = 이동(팬) · 더블클릭/⌂ = 맞춤. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CadDocument, CadEntity } from '../api/services'

type VB = { x: number; y: number; w: number; h: number }

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
  const drag = useRef<{ px: number; py: number; vb: VB; scale: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // client px → 뷰박스 단위 스케일 (preserveAspectRatio=meet 기준)
  const clientScale = (v: VB) => {
    const r = svgRef.current!.getBoundingClientRect()
    return Math.max(v.w / r.width, v.h / r.height)
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = svgRef.current
    if (!el) return
    const v = viewRef.current
    const f = fitRef.current
    const r = el.getBoundingClientRect()
    const s = Math.max(v.w / r.width, v.h / r.height)
    // meet 중앙 정렬 보정 — 실제 렌더 영역의 화면 오프셋
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

  // React 합성 onWheel 은 passive 라 preventDefault 불가 → 네이티브 리스너
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      zoomAt(ev.clientX, ev.clientY, Math.exp(ev.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc.layers.forEach((l) => {
      m[l.layerName] = l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex
    })
    return m
  }, [doc])

  // 화면상 선 굵기 일정 유지 — 현재 뷰 크기에 비례
  const strokeW = Math.max(view.w, view.h) / 500

  const render = (e: CadEntity) => {
    if (hidden.has(e.layerName)) return null
    const color = layerColor[e.layerName] ?? '#2B3A55'
    const common = { stroke: color, strokeWidth: strokeW, fill: 'none' as const }
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        data-cad-svg
        style={{ display: 'block', touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            px: e.clientX, py: e.clientY, vb: viewRef.current,
            scale: clientScale(viewRef.current),
          }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setVb({
            ...d.vb,
            x: d.vb.x - (e.clientX - d.px) * d.scale,
            y: d.vb.y - (e.clientY - d.py) * d.scale,
          })
        }}
        onPointerUp={() => { drag.current = null; setDragging(false) }}
        onPointerCancel={() => { drag.current = null; setDragging(false) }}
        onDoubleClick={() => setVb(null)}>
        <g transform="scale(1,-1)">
          {doc.entities.map(render)}
        </g>
      </svg>
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
      </div>
      <div style={{
        position: 'absolute', bottom: 6, right: 8, fontSize: 10,
        color: 'var(--txt-mute)', background: '#ffffffcc', padding: '2px 6px',
        borderRadius: 2, pointerEvents: 'none', userSelect: 'none',
      }}>
        휠 줌 · 드래그 이동 · 더블클릭 맞춤
      </div>
    </div>
  )
}
