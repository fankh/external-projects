'use client'

/** 도면 캔버스 (.cvs) — Block(.m2)·치수(.d2)·커맨드 라인 (CAD 문법).
 *  줌/팬 내장: 휠 = 커서 기준 줌 · 배경 드래그 = 이동 · 배경 더블클릭/⌂ = 원위치. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CanvasBlock } from '@/lib/cadTypes'
import { useI18n } from '@/components/I18nProvider'

export function Cvs(props: {
  blocks: CanvasBlock[]
  selectedId?: string | null
  onSelect?: (b: CanvasBlock) => void
  onOpen?: (b: CanvasBlock) => void   // 더블클릭 = 상세 (레거시 문법)
  onMoveBlock?: (id: string, x: number, y: number) => void   // G1 — 드래그 이동(영속)
  dims?: { x: number; y: number; w: number; label: string }[]
  labels?: { x: number; y: number; text: string }[]
  style?: CSSProperties
  children?: ReactNode
}) {
  const [t, setT] = useState({ x: 0, y: 0, s: 1 })
  const tRef = useRef(t)
  tRef.current = t
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // G1 — 블록 이동 드래그 (편집 모드: onMoveBlock 제공 시)
  const bdrag = useRef<{ id: string; ox: number; oy: number; px: number; py: number } | null>(null)
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})

  // React 합성 onWheel 은 passive → 네이티브 리스너로 preventDefault
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = ev.clientX - r.left
      const cy = ev.clientY - r.top
      const cur = tRef.current
      const ns = Math.min(8, Math.max(0.25, cur.s * Math.exp(-ev.deltaY * 0.0015)))
      const k = ns / cur.s
      setT({ s: ns, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const isBg = (e: { target: EventTarget }) =>
    !(e.target as HTMLElement).closest('.m2, button, input, select, textarea, a')

  const zoomBtn: CSSProperties = {
    width: 20, height: 20, padding: 0, border: '1px solid var(--line)',
    background: '#fff', color: 'var(--txt)', fontSize: 11, lineHeight: '18px',
    cursor: 'pointer', borderRadius: 2,
  }

  return (
    <div ref={ref} className="cvs" style={{
      ...props.style,
      cursor: dragging ? 'grabbing' : undefined,
      touchAction: 'none',
    }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !isBg(e)) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { px: e.clientX, py: e.clientY, x: tRef.current.x, y: tRef.current.y }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        const bd = bdrag.current
        if (bd) {   // G1 — 블록 이동 (스케일 보정)
          const dx = (e.clientX - bd.px) / tRef.current.s
          const dy = (e.clientY - bd.py) / tRef.current.s
          setMoved((m) => ({ ...m, [bd.id]: { x: Math.round(bd.ox + dx), y: Math.round(bd.oy + dy) } }))
          return
        }
        const d = drag.current
        if (!d) return
        setT((cur) => ({ ...cur, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
      }}
      onPointerUp={() => {
        const bd = bdrag.current
        if (bd) {
          const pos = moved[bd.id]
          if (pos && props.onMoveBlock) props.onMoveBlock(bd.id, pos.x, pos.y)
          bdrag.current = null; setDragging(false); return
        }
        drag.current = null; setDragging(false)
      }}
      onPointerCancel={() => { drag.current = null; bdrag.current = null; setDragging(false) }}
      onDoubleClick={(e) => { if (isBg(e)) setT({ x: 0, y: 0, s: 1 }) }}>
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
        transformOrigin: '0 0',
      }}>
        {props.dims?.map((d, i) => (
          <div key={i} className="d2" style={{ left: d.x, top: d.y, width: d.w }}>
            <span>{d.label}</span>
          </div>
        ))}
        {props.blocks.map((b) => {
          const pos = moved[b.id] ?? { x: b.x, y: b.y }
          return (
          <div key={b.id}
            className={`m2 ${props.selectedId === b.id ? 'sel' : ''}`}
            style={{
              left: pos.x, top: pos.y, width: b.w, height: b.h,
              borderStyle: b.dashed ? 'dashed' : undefined,
              cursor: props.onMoveBlock ? 'move' : undefined,
            }}
            onPointerDown={props.onMoveBlock ? (e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              // 캡처는 블록 자신에 — 루트 캡처 시 파생 dblclick 이 캔버스로 리타겟되어 onOpen 이 죽는다 (U1)
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              bdrag.current = { id: b.id, ox: pos.x, oy: pos.y, px: e.clientX, py: e.clientY }
              setDragging(true)
              props.onSelect?.(b)
            } : undefined}
            onClick={() => props.onSelect?.(b)}
            onDoubleClick={() => props.onOpen?.(b)}>
            {b.name}
            {b.sub ? <small>{b.sub}</small> : null}
          </div>
          )
        })}
        {props.labels?.map((l, i) => (
          <div key={i} style={{ position: 'absolute', left: l.x, top: l.y, color: '#3B6BB4', fontSize: 9 }}>
            {l.text}
          </div>
        ))}
        {props.children}
      </div>
      <div style={{
        position: 'absolute', top: 4, right: 4, display: 'flex', gap: 3,
        alignItems: 'center', userSelect: 'none', zIndex: 2,
      }}>
        <span style={{ fontSize: 9.5, color: 'var(--txt-mute)', background: '#ffffffcc', padding: '1px 4px', borderRadius: 2 }}>
          {Math.round(t.s * 100)}%
        </span>
        <button type="button" style={zoomBtn} title="확대" data-cvs-zoom-in
          onClick={(e) => {
            e.stopPropagation()
            const el = ref.current!
            const r = el.getBoundingClientRect()
            const cx = r.width / 2, cy = r.height / 2
            setT((cur) => {
              const ns = Math.min(8, cur.s * 1.4)
              const k = ns / cur.s
              return { s: ns, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k }
            })
          }}>＋</button>
        <button type="button" style={zoomBtn} title="축소" data-cvs-zoom-out
          onClick={(e) => {
            e.stopPropagation()
            const el = ref.current!
            const r = el.getBoundingClientRect()
            const cx = r.width / 2, cy = r.height / 2
            setT((cur) => {
              const ns = Math.max(0.25, cur.s / 1.4)
              const k = ns / cur.s
              return { s: ns, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k }
            })
          }}>－</button>
        <button type="button" style={zoomBtn} title="원위치 (배경 더블클릭)" data-cvs-fit
          onClick={(e) => { e.stopPropagation(); setT({ x: 0, y: 0, s: 1 }) }}>⌂</button>
      </div>
    </div>
  )
}

export function CommandLine(props: {
  prompt: string
  coord?: string
  onCommand?: (cmd: string) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  return (
    <div className="cmdline">
      <span className="lbl">{t('cvs.cmd', '명령:')}</span>
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
