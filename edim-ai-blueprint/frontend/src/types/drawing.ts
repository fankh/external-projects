// TypeScript mirror of backend/app/schemas/drawing.py

export interface Point2D {
  x: number
  y: number
}

export interface DrawingBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface LayerInfo {
  layerName: string
  colorHex: string
  isVisible: boolean
}

interface BaseEntity {
  entityId: string
  layerName: string
}

export interface LineEntity extends BaseEntity {
  entityType: 'line'
  startPoint: Point2D
  endPoint: Point2D
}

export interface PolylineEntity extends BaseEntity {
  entityType: 'polyline'
  vertexPoints: Point2D[]
  isClosed: boolean
}

export interface CircleEntity extends BaseEntity {
  entityType: 'circle'
  centerPoint: Point2D
  radius: number
}

export interface ArcEntity extends BaseEntity {
  entityType: 'arc'
  centerPoint: Point2D
  radius: number
  startAngleDegrees: number
  endAngleDegrees: number
}

export interface TextEntity extends BaseEntity {
  entityType: 'text'
  insertionPoint: Point2D
  textContent: string
  textHeight: number
  rotationDegrees: number
}

export type DrawingEntity =
  | LineEntity
  | PolylineEntity
  | CircleEntity
  | ArcEntity
  | TextEntity

export interface DrawingDocument {
  drawingName: string
  sourceFormat: 'dxf' | 'dwg' | 'ifc' | 'ai-generated'
  units: 'millimeters' | 'meters' | 'unitless'
  bounds: DrawingBounds
  layers: LayerInfo[]
  entities: DrawingEntity[]
  skippedEntityCounts: Record<string, number>
}
