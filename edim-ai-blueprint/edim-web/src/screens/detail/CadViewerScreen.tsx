/** CAD 뷰어 (INT-04) — MinIO 저장 DXF 를 정규화 DrawingDocument 로 파싱해 SVG 렌더.
 *  레이어 표시 토글 · 휠 줌 · 맞춤 · 다운로드. DWG 는 ODA 미설정 시 501 안내. */
import { useEffect, useMemo, useState } from 'react'
import {
  cadService, fileService, type CadDocument, type CadEntity,
} from '../../api/services'
import { Btn, Chip } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

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

export function CadViewerScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const fileId = Number(tab.params?.fileId ?? 0)
  const name = String(tab.params?.name ?? 'drawing.dxf')
  const [doc, setDoc] = useState<CadDocument | null>(null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    void cadService.view(fileId)
      .then((d) => {
        if (d === null) setOffline(true)
        else {
          setDoc(d)
          shell.setStatusMsg(
            `CAD 로드 — ${d.drawingName} · 엔티티 ${d.entities.length} · ${d.units}`)
        }
      })
      .catch((e: Error) => {
        setError(e.message)
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>)
      })
  }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const viewBox = useMemo(() => {
    if (!doc) return '0 0 100 100'
    const { minX, minY, maxX, maxY } = doc.bounds
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const mx = w * 0.05 + 10
    const my = h * 0.05 + 10
    const zw = (w + mx * 2) / zoom
    const zh = (h + my * 2) / zoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    // y-반전 그룹 기준 — viewBox 는 (x, -yMax) 좌표계
    return `${cx - zw / 2} ${-cy - zh / 2} ${zw} ${zh}`
  }, [doc, zoom])

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc?.layers.forEach((l) => { m[l.layerName] = l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex })
    return m
  }, [doc])

  const strokeW = doc
    ? Math.max(doc.bounds.maxX - doc.bounds.minX, doc.bounds.maxY - doc.bounds.minY) / 400 / zoom
    : 1

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
    <div className="fill-col">
      <div className="toolbar">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{name}</span>
        {doc ? <Chip tone="info">{doc.sourceFormat.toUpperCase()} · {doc.units}</Chip> : null}
        <span className="sep" />
        <Btn onClick={() => setZoom(1)}>맞춤</Btn>
        <Btn variant="ic" onClick={() => setZoom((z) => Math.min(z * 1.4, 40))}>＋</Btn>
        <Btn variant="ic" onClick={() => setZoom((z) => Math.max(z / 1.4, 0.2))}>－</Btn>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{Math.round(zoom * 100)}% (휠 줌)</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => {
          void fileService.download(fileId, name)
            .catch((e: Error) => shell.setStatusMsg(
              <span style={{ color: 'var(--err)' }}>{e.message}</span>))
        }}>⬇ DXF</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 200, borderRight: '1px solid var(--line)', background: '#FAFBFC', overflow: 'auto', flex: 'none' }}>
          <div className="lnav" style={{ width: '100%', border: 'none' }}>
            <div className="hd">레이어 {doc ? `(${doc.layers.length})` : ''}</div>
            <div className="tree2">
              {doc?.layers.map((l) => (
                <div key={l.layerName} className="tn" style={{ gap: 6 }}
                  onClick={() => setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(l.layerName)) next.delete(l.layerName)
                    else next.add(l.layerName)
                    return next
                  })}>
                  <input type="checkbox" readOnly checked={!hidden.has(l.layerName)}
                    aria-label={`레이어 ${l.layerName}`} />
                  <span style={{
                    width: 10, height: 10, background: layerColor[l.layerName],
                    border: '1px solid var(--line)', flex: 'none',
                  }} />
                  {l.layerName}
                </div>
              ))}
            </div>
            {doc ? (
              <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.8, borderTop: '1px solid var(--line)' }}>
                엔티티 {doc.entities.length}<br />
                {Object.entries(doc.skippedEntityCounts).length > 0
                  ? `미지원 스킵: ${Object.entries(doc.skippedEntityCounts)
                    .map(([k, v]) => `${k}×${v}`).join(', ')}`
                  : '전 엔티티 렌더됨'}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1, background: '#fff', minWidth: 0 }}
          onWheel={(e) => setZoom((z) => Math.min(40, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 0.87))))}>
          {doc ? (
            <svg width="100%" height="100%" viewBox={viewBox} data-cad-svg
              style={{ display: 'block' }}>
              <g transform="scale(1,-1)">
                {doc.entities.map(render)}
              </g>
            </svg>
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11.5, textAlign: 'center', lineHeight: 2 }}>
              {error
                ? <span style={{ color: 'var(--err)' }}>{error}</span>
                : offline
                  ? <>CAD 파싱은 백엔드가 필요합니다 (현재 MOCK 모드)<br />
                    <span style={{ fontSize: 10.5 }}>ezdxf 파서 — DWG 는 ODA File Converter 설정 후 지원</span></>
                  : '로드 중…'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
