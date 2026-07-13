/** CAD 편집 op 로컬 적용 — 이동(move)을 낙관적으로 즉시 반영(서버 왕복 제거, 배경 영속).
 *  move 는 엔티티 수·순서를 보존하므로 e-ID 매핑이 안정적 → 낙관적 적용 안전.
 *  add/delete/rotate/mirror/copy/trim 은 ID/지오메트리 변동으로 서버 정본 왕복 유지. */
import type { CadDocument, CadEntity, CadPoint } from '@/lib/cadTypes'
import type { CadEditOp } from './CadSvg'

const shift = (p: CadPoint | undefined, dx: number, dy: number): CadPoint | undefined =>
  p ? { x: p.x + dx, y: p.y + dy } : p

function translateEntity(e: CadEntity, dx: number, dy: number): CadEntity {
  return {
    ...e,
    startPoint: shift(e.startPoint, dx, dy),
    endPoint: shift(e.endPoint, dx, dy),
    centerPoint: shift(e.centerPoint, dx, dy),
    insertionPoint: shift(e.insertionPoint, dx, dy),
    vertexPoints: e.vertexPoints?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }
}

/** 모든 op 가 move 면 낙관적 로컬 적용 결과를 반환, 아니면 null(서버 왕복 필요). */
export function applyMovesLocal(doc: CadDocument, ops: CadEditOp[]): CadDocument | null {
  if (!ops.length || !ops.every((o) => o.op === 'move')) return null
  const byId = new Map<string, { dx: number; dy: number }>()
  for (const o of ops) if (o.entityId) byId.set(o.entityId, { dx: o.dx ?? 0, dy: o.dy ?? 0 })
  const entities = doc.entities.map((e) => {
    const m = byId.get(e.entityId)
    return m ? translateEntity(e, m.dx, m.dy) : e
  })
  return { ...doc, entities }
}
