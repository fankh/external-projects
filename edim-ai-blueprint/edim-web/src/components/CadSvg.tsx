/** 정규화 DrawingDocument → SVG 렌더 (공용) — CAD 뷰어·C-1 구성 CAD 모드에서 사용. */
import { useMemo } from 'react'
import type { CadDocument, CadEntity } from '../api/services'

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
  zoom?: number
}) {
  const { doc } = props
  const zoom = props.zoom ?? 1
  const hidden = props.hiddenLayers ?? new Set<string>()

  const viewBox = useMemo(() => {
    const { minX, minY, maxX, maxY } = doc.bounds
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const mx = w * 0.05 + 10
    const my = h * 0.05 + 10
    const zw = (w + mx * 2) / zoom
    const zh = (h + my * 2) / zoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return `${cx - zw / 2} ${-cy - zh / 2} ${zw} ${zh}`
  }, [doc, zoom])

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc.layers.forEach((l) => {
      m[l.layerName] = l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex
    })
    return m
  }, [doc])

  const strokeW = Math.max(
    doc.bounds.maxX - doc.bounds.minX, doc.bounds.maxY - doc.bounds.minY) / 400 / zoom

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

  return (
    <svg width="100%" height="100%" viewBox={viewBox} data-cad-svg
      style={{ display: 'block' }}>
      <g transform="scale(1,-1)">
        {doc.entities.map(render)}
      </g>
    </svg>
  )
}
