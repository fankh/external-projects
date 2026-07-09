/** 도면 캔버스 (.cvs) — Block(.m2)·치수(.d2)·커맨드 라인 (CAD 문법). */
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CanvasBlock } from '../api/types'

export function Cvs(props: {
  blocks: CanvasBlock[]
  selectedId?: string | null
  onSelect?: (b: CanvasBlock) => void
  onOpen?: (b: CanvasBlock) => void   // 더블클릭 = 상세 (레거시 문법)
  dims?: { x: number; y: number; w: number; label: string }[]
  labels?: { x: number; y: number; text: string }[]
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <div className="cvs" style={props.style}>
      {props.dims?.map((d, i) => (
        <div key={i} className="d2" style={{ left: d.x, top: d.y, width: d.w }}>
          <span>{d.label}</span>
        </div>
      ))}
      {props.blocks.map((b) => (
        <div key={b.id}
          className={`m2 ${props.selectedId === b.id ? 'sel' : ''}`}
          style={{
            left: b.x, top: b.y, width: b.w, height: b.h,
            borderStyle: b.dashed ? 'dashed' : undefined,
          }}
          onClick={() => props.onSelect?.(b)}
          onDoubleClick={() => props.onOpen?.(b)}>
          {b.name}
          {b.sub ? <small>{b.sub}</small> : null}
        </div>
      ))}
      {props.labels?.map((l, i) => (
        <div key={i} style={{ position: 'absolute', left: l.x, top: l.y, color: '#3B6BB4', fontSize: 9 }}>
          {l.text}
        </div>
      ))}
      {props.children}
    </div>
  )
}

export function CommandLine(props: {
  prompt: string
  coord?: string
  onCommand?: (cmd: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="cmdline">
      <span className="lbl">명령:</span>
      <span style={{ color: 'var(--title-navy)' }}>{props.prompt}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="명령 입력"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            props.onCommand?.(value.trim())
            setValue('')
          }
        }} />
      <span className="coord">{props.coord ?? ''}</span>
    </div>
  )
}
