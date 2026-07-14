import { apiServer } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { CanvasBlock, CadDocument, DimensionDef, DrawingBlockRow, DwgRelationRow } from '@/lib/cadTypes'
import { DesignEditor } from './DesignEditor'

export const dynamic = 'force-dynamic'

const DWG_DIMS: DimensionDef[] = [
  { no: 'A', value: '670', binding: 'MACRO', kind: 'KEY' },
  { no: 'B', value: '=A+56', binding: 'MACRO', kind: 'KEY' },
  { no: 'C', value: '45', binding: 'VARIANT', kind: 'DETAIL' },
  { no: 'D', value: '=Table12(B,710)', binding: 'MACRO', kind: 'DETAIL' },
  { no: 'E', value: '320', binding: 'VARIANT', kind: 'DETAIL' },
  { no: 'K', value: '=A*1.62', binding: 'MACRO', kind: 'KEY' },
]
const DWG_BLOCKS: CanvasBlock[] = [
  { id: 'casing', name: 'Casing', x: 190, y: 60, w: 220, h: 180 },
  { id: 'impeller', name: 'Impeller', sub: 'Airfoil 900', x: 230, y: 80, w: 140, h: 100 },
  { id: 'shaft', name: 'Shaft', x: 80, y: 150, w: 440, h: 12 },
  { id: 'brgL', name: 'Brg', x: 96, y: 138, w: 26, h: 34 },
  { id: 'brgR', name: 'Brg', x: 478, y: 138, w: 26, h: 34 },
  { id: 'coneL', name: 'Inlet Cone', x: 150, y: 96, w: 40, h: 110, dashed: true },
  { id: 'coneR', name: 'Inlet Cone', x: 410, y: 96, w: 40, h: 110, dashed: true },
]
const DWG = 'KDCR 3-13'

const numeric = (src: DimensionDef[]) => {
  const v: Record<string, number> = {}
  for (const d of src) { const n = Number(d.value); if (!Number.isNaN(n)) v[d.no] = n }
  return v
}

export default async function DesignPage() {
  // 치수 정의 실DB 로드 → 없으면 mock 폴백
  const dbDims = await apiServer<DimensionDef[]>(`/drawings/dimensions?drawing=${encodeURIComponent(DWG)}`).catch(() => null)
  const dims = dbDims && dbDims.length ? dbDims : DWG_DIMS

  const [doc, blockRows, relations, bom] = await Promise.all([
    apiServer<{ document: CadDocument }>('/cad/part-drawing', { method: 'POST', body: JSON.stringify({ dims: numeric(dims) }) }).then((r) => r.document).catch(() => null),
    apiServer<DrawingBlockRow[]>(`/drawings/${encodeURIComponent(DWG)}/blocks`).catch(() => []),
    apiServer<DwgRelationRow[]>(`/drawings/${encodeURIComponent(DWG)}/relations`).catch(() => []),
    apiServer<{ bomId: number; partNo: string; partName: string; qty: number; assemblySeq: number | null; assemblyNote: string }[]>(`/drawings/${encodeURIComponent(DWG)}/bom`).catch(() => []),
  ])
  const blocks: CanvasBlock[] = blockRows.length
    ? blockRows.map((b) => ({ id: `blk:${b.documentId}`, name: b.blockName, sub: b.content.sub, x: b.content.x, y: b.content.y, w: b.content.w, h: b.content.h, dashed: b.content.dashed }))
    : DWG_BLOCKS

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Design Editor (S-4-1-1) — KDCR 3-13" source="/drawings/dimensions · /cad/part-drawing · blocks/relations/bom" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <DesignEditor initialDims={dims} initialDoc={doc} blocks={blocks} relations={relations} bom={bom} />
      </div>
    </div>
  )
}
