/** CAD 정규화 문서 타입 (SPA services.ts 와 동일) — CadSvg·bridge 공용. */
export interface CanvasBlock { id: string; name: string; sub?: string; x: number; y: number; w: number; h: number; dashed?: boolean }
export interface CadPoint { x: number; y: number }
export interface CadLayer { layerName: string; colorHex: string; isVisible: boolean }
export interface CadEntity {
  entityId: string
  entityType: 'line' | 'polyline' | 'circle' | 'arc' | 'text'
  layerName: string
  startPoint?: CadPoint
  endPoint?: CadPoint
  vertexPoints?: CadPoint[]
  isClosed?: boolean
  centerPoint?: CadPoint
  radius?: number
  startAngleDegrees?: number
  endAngleDegrees?: number
  insertionPoint?: CadPoint
  textContent?: string
  textHeight?: number
  rotationDegrees?: number
}
export interface CadDocument {
  drawingName: string
  sourceFormat: string
  units: string
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  layers: CadLayer[]
  entities: CadEntity[]
  skippedEntityCounts: Record<string, number>
}
