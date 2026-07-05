import { useEffect, useMemo, useRef } from 'react'
import type { ArcEntity, DrawingDocument, DrawingEntity } from '../types/drawing'
import { usePanZoom } from '../hooks/usePanZoom'
import { BlueprintIcon } from './Icons'

const DEGREES_TO_RADIANS = Math.PI / 180

function buildArcPathData(arcEntity: ArcEntity): string {
  const { centerPoint, radius, startAngleDegrees, endAngleDegrees } = arcEntity
  const startX = centerPoint.x + radius * Math.cos(startAngleDegrees * DEGREES_TO_RADIANS)
  const startY = centerPoint.y + radius * Math.sin(startAngleDegrees * DEGREES_TO_RADIANS)
  const endX = centerPoint.x + radius * Math.cos(endAngleDegrees * DEGREES_TO_RADIANS)
  const endY = centerPoint.y + radius * Math.sin(endAngleDegrees * DEGREES_TO_RADIANS)

  const sweepDegrees = ((endAngleDegrees - startAngleDegrees) % 360 + 360) % 360
  const largeArcFlag = sweepDegrees > 180 ? 1 : 0
  // CAD arcs run counter-clockwise; in this pre-flip coordinate space that is
  // SVG's positive-angle direction, i.e. sweep-flag = 1.
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
}

interface BlueprintCanvasProps {
  drawingDocument: DrawingDocument | null
  hiddenLayerNames: Set<string>
}

export function BlueprintCanvas({ drawingDocument, hiddenLayerNames }: BlueprintCanvasProps) {
  const svgElementRef = useRef<SVGSVGElement | null>(null)
  const panZoom = usePanZoom(svgElementRef)

  useEffect(() => {
    if (drawingDocument) panZoom.fitToBounds(drawingDocument.bounds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingDocument])

  const layerColorByName = useMemo(() => {
    const colorMap = new Map<string, string>()
    drawingDocument?.layers.forEach((layer) => colorMap.set(layer.layerName, layer.colorHex))
    return colorMap
  }, [drawingDocument])

  if (!drawingDocument) {
    return (
      <div className="canvas-empty">
        <span className="canvas-empty-icon">
          <BlueprintIcon size={28} />
        </span>
        <div className="canvas-empty-title">제품 도면을 시작하세요</div>
        <div className="canvas-empty-hint">
          제품·부품 도면(DXF · DWG · IFC)을 업로드하거나 AI 프롬프트로 새 도면을 생성하세요.
        </div>
      </div>
    )
  }

  const renderEntity = (entity: DrawingEntity) => {
    if (hiddenLayerNames.has(entity.layerName)) return null
    const strokeColor = layerColorByName.get(entity.layerName) ?? '#e8e8e8'
    const sharedProps = {
      stroke: strokeColor,
      fill: 'none',
      vectorEffect: 'non-scaling-stroke' as const,
      strokeWidth: 1.5,
    }

    switch (entity.entityType) {
      case 'line':
        return (
          <line key={entity.entityId} {...sharedProps}
            x1={entity.startPoint.x} y1={entity.startPoint.y}
            x2={entity.endPoint.x} y2={entity.endPoint.y} />
        )
      case 'polyline': {
        const pointsAttribute = entity.vertexPoints
          .map((vertex) => `${vertex.x},${vertex.y}`).join(' ')
        return entity.isClosed
          ? <polygon key={entity.entityId} {...sharedProps} points={pointsAttribute} />
          : <polyline key={entity.entityId} {...sharedProps} points={pointsAttribute} />
      }
      case 'circle':
        return (
          <circle key={entity.entityId} {...sharedProps}
            cx={entity.centerPoint.x} cy={entity.centerPoint.y} r={entity.radius} />
        )
      case 'arc':
        return <path key={entity.entityId} {...sharedProps} d={buildArcPathData(entity)} />
      case 'text':
        // Local scale(1,-1) cancels the group flip so text reads upright.
        return (
          <text key={entity.entityId}
            fill={strokeColor} stroke="none"
            fontSize={entity.textHeight}
            transform={`translate(${entity.insertionPoint.x} ${entity.insertionPoint.y}) scale(1,-1) rotate(${-entity.rotationDegrees})`}>
            {entity.textContent}
          </text>
        )
    }
  }

  return (
    <svg
      ref={svgElementRef}
      className="blueprint-canvas"
      viewBox={panZoom.viewBoxString}
      onWheel={panZoom.handleWheel}
      onPointerDown={panZoom.handlePointerDown}
      onPointerMove={panZoom.handlePointerMove}
      onPointerUp={panZoom.handlePointerUp}
    >
      {/* Flip CAD's Y-up into SVG's Y-down screen space */}
      <g transform="scale(1,-1)">
        {drawingDocument.entities.map(renderEntity)}
      </g>
    </svg>
  )
}
