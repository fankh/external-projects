'use client'

import { useState } from 'react'
import { CadSvg } from '@/components/CadSvg'
import type { CadDocument } from '@/lib/cadTypes'

/** DXF/DWG 뷰어 — SSR /cad/view/{id} → CadSvg 렌더 + 레이어 토글 + 편집 모드(DXF). */
export function CadViewer({ doc, fileId }: { doc: CadDocument; fileId: number }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState(false)
  const toggle = (l: string) => setHidden((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n })
  const canEdit = doc.sourceFormat === 'dxf'

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{doc.drawingName}</span>
        <span className="chip info">{doc.sourceFormat.toUpperCase()}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>엔티티 {doc.entities.length} · file {fileId}</span>
        {canEdit ? <button type="button" className={`b ${edit ? 'pri' : ''}`} style={{ height: 18, fontSize: 10 }} onClick={() => setEdit((e) => !e)}>✎ 편집</button> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>레이어</span>
        {doc.layers.map((l) => (
          <button key={l.layerName} type="button" className={`b ${hidden.has(l.layerName) ? '' : 'pri'}`}
            style={{ height: 18, fontSize: 9.5 }} onClick={() => toggle(l.layerName)}>{l.layerName}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CadSvg doc={doc} hiddenLayers={hidden} editable={edit && canEdit} />
      </div>
    </div>
  )
}
