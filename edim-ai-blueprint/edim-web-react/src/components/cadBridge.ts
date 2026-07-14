/** 엔진 통합 브리지 — Cvs 블록 모델(div y-down)을 정규화 DrawingDocument(y-up)로 변환.
 *  ARCHITECTURE §1: 모든 입력은 하나의 DrawingDocument 로 수렴 → CadSvg 실엔진이 단일 렌더 백엔드.
 *  서버 build_blocks_dxf 와 동일 geometry (즉시 렌더용 클라이언트 변환; DXF 익스포트는 서버). */
import type { CanvasBlock } from '../api/types'
import type { CadDocument, CadEntity } from '../api/services'

export interface CadDim { x: number; y: number; w: number; label?: string }
export interface CadLabel { x: number; y: number; text: string }

const LAYERS = [
  { layerName: 'BLOCK', colorHex: '#2F6FB0', isVisible: true },
  { layerName: 'BLOCK_DASHED', colorHex: '#C0392B', isVisible: true },
  { layerName: 'DIM', colorHex: '#2F9463', isVisible: true },
  { layerName: 'LABEL', colorHex: '#6B7488', isVisible: true },
]

export function blocksToCadDoc(
  blocks: CanvasBlock[], dims: CadDim[] = [], labels: CadLabel[] = [], name = 'Block Diagram',
): CadDocument {
  const ents: CadEntity[] = []
  let seq = 1
  const nid = () => `b${seq++}`
  const xs: number[] = [], ys: number[] = []
  const mark = (x: number, y: number) => { xs.push(x); ys.push(y) }

  for (const b of blocks) {
    const { x, y, w, h } = b
    // y-down → y-up : 상단 -y, 하단 -(y+h)
    const v = [{ x, y: -y }, { x: x + w, y: -y }, { x: x + w, y: -(y + h) }, { x, y: -(y + h) }]
    ents.push({ entityId: nid(), entityType: 'polyline', layerName: b.dashed ? 'BLOCK_DASHED' : 'BLOCK', isClosed: true, vertexPoints: v })
    v.forEach((p) => mark(p.x, p.y))
    if (b.name) ents.push({ entityId: nid(), entityType: 'text', layerName: 'LABEL', textContent: b.name, textHeight: Math.max(9, h * 0.18), insertionPoint: { x: x + w / 2, y: -(y + h * 0.38) } })
    if (b.sub) ents.push({ entityId: nid(), entityType: 'text', layerName: 'LABEL', textContent: b.sub, textHeight: Math.max(7, h * 0.13), insertionPoint: { x: x + w / 2, y: -(y + h * 0.66) } })
  }
  for (const d of dims) {
    ents.push({ entityId: nid(), entityType: 'line', layerName: 'DIM', startPoint: { x: d.x, y: -d.y }, endPoint: { x: d.x + d.w, y: -d.y } })
    mark(d.x, -d.y); mark(d.x + d.w, -d.y)
    if (d.label) ents.push({ entityId: nid(), entityType: 'text', layerName: 'DIM', textContent: d.label, textHeight: 12, insertionPoint: { x: d.x + d.w / 2, y: -d.y + 14 } })
  }
  for (const lb of labels) {
    ents.push({ entityId: nid(), entityType: 'text', layerName: 'LABEL', textContent: lb.text, textHeight: 11, insertionPoint: { x: lb.x, y: -lb.y } })
    mark(lb.x, -lb.y)
  }
  const bounds = xs.length
    ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    : { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return { drawingName: name, sourceFormat: 'BLOCKS', units: 'px', bounds, layers: LAYERS, entities: ents, skippedEntityCounts: {} }
}
