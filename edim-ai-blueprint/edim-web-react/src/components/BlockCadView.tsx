/** 엔진 통합 뷰 — Cvs 블록 모델을 CadSvg 실엔진(DrawingDocument)으로 렌더 + DXF 익스포트.
 *  블록 다이어그램을 정규화 DrawingDocument 로 수렴시켜 단일 렌더/익스포트 파이프라인 사용. */
import { useMemo } from 'react'
import type { CanvasBlock } from '../api/types'
import { cadService } from '../api/services'
import { blocksToCadDoc, type CadDim, type CadLabel } from './cadBridge'
import { CadSvg } from './CadSvg'

export function BlockCadView(props: {
  blocks: CanvasBlock[]
  dims?: CadDim[]
  labels?: CadLabel[]
  name?: string
  onStatus?: (msg: string) => void
  onError?: (msg: string) => void
}) {
  const doc = useMemo(
    () => blocksToCadDoc(props.blocks, props.dims ?? [], props.labels ?? [], props.name ?? 'Block Diagram'),
    [props.blocks, props.dims, props.labels, props.name])

  const exportDxf = () => {
    void cadService.blocksDxf({ name: props.name ?? 'block_diagram', blocks: props.blocks, dims: props.dims ?? [], labels: props.labels ?? [] })
      .then(() => props.onStatus?.(`DXF ✓ — 블록 ${props.blocks.length}개 (엔진 통합 · DrawingDocument→DXF)`))
      .catch((e: Error) => props.onError?.(e.message))
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <button type="button" data-block-dxf className="b" style={{ position: 'absolute', top: 4, left: 4, zIndex: 6, fontSize: 10, height: 20 }}
        onClick={exportDxf} title="블록 다이어그램 DXF 내보내기">⬇ DXF</button>
      <CadSvg doc={doc} />
    </div>
  )
}
