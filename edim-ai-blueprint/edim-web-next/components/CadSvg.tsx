'use client'

/** 정규화 DrawingDocument → SVG 렌더 (공용) — CAD 뷰어·C-1 구성 CAD·Design Editor CAD 에서 사용.
 *  인터랙션 내장: 휠 = 커서 기준 줌 · 드래그 = 이동(팬) · 더블클릭/⌂ = 맞춤 ·
 *  📏 측정(두 점 클릭 → 거리·Δ, 끝점/중심 스냅) · 엔티티 클릭 = 속성 조회(하이라이트+정보 패널). */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CadDocument, CadEntity } from '@/lib/cadTypes'
import { useI18n } from '@/components/I18nProvider'

type VB = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }

function arcPath(e: CadEntity): string {
  const c = e.centerPoint!
  const r = e.radius!
  const a0 = (e.startAngleDegrees! * Math.PI) / 180
  const a1 = (e.endAngleDegrees! * Math.PI) / 180
  const x0 = c.x + r * Math.cos(a0)
  const y0 = c.y + r * Math.sin(a0)
  const x1 = c.x + r * Math.cos(a1)
  const y1 = c.y + r * Math.sin(a1)
  let sweep = e.endAngleDegrees! - e.startAngleDegrees!
  if (sweep < 0) sweep += 360
  const large = sweep > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** 점-선분 거리 */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

/** 두 선분 교차점 (양 선분 내부일 때만 반환) — 교차점 스냅용 */
function segSegIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x)
  if (Math.abs(d) < 1e-9) return null
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) }
}

/** 엔티티의 선분 목록 (교차점 계산용) */
function entitySegments(e: CadEntity): [Pt, Pt][] {
  if (e.entityType === 'line') return [[e.startPoint!, e.endPoint!]]
  if (e.entityType === 'polyline') {
    const v = e.vertexPoints!
    const segs: [Pt, Pt][] = []
    for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
    if (e.isClosed && v.length > 2) segs.push([v[v.length - 1], v[0]])
    return segs
  }
  return []
}

/** 수선의 발 — 점 s 에서 무한직선 a-b 로 내린 수선의 발 (perp 스냅) */
function perpFoot(s: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (!l2) return a
  const t = ((s.x - a.x) * dx + (s.y - a.y) * dy) / l2
  return { x: a.x + t * dx, y: a.y + t * dy }
}

/** 엔티티까지의 거리 (도면 좌표) — 히트 테스트용 */
function entityDist(p: Pt, e: CadEntity): number {
  switch (e.entityType) {
    case 'line':
      return segDist(p, e.startPoint!, e.endPoint!)
    case 'polyline': {
      const v = e.vertexPoints!
      let d = Infinity
      for (let i = 0; i < v.length - 1; i++) d = Math.min(d, segDist(p, v[i], v[i + 1]))
      if (e.isClosed && v.length > 2) d = Math.min(d, segDist(p, v[v.length - 1], v[0]))
      return d
    }
    case 'circle':
      return Math.abs(dist(p, e.centerPoint!) - e.radius!)
    case 'arc': {
      const c = e.centerPoint!
      const ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
      const norm = (a: number) => ((a % 360) + 360) % 360
      const a0 = norm(e.startAngleDegrees!)
      let sweep = norm(e.endAngleDegrees! - e.startAngleDegrees!)
      if (sweep === 0) sweep = 360
      const rel = norm(ang - a0)
      if (rel <= sweep) return Math.abs(dist(p, c) - e.radius!)
      return Infinity
    }
    case 'text': {
      const ip = e.insertionPoint!
      const h = e.textHeight ?? 10
      const w = (e.textContent?.length ?? 1) * h * 0.62
      const dx = p.x < ip.x ? ip.x - p.x : p.x > ip.x + w ? p.x - ip.x - w : 0
      const dy = p.y < ip.y ? ip.y - p.y : p.y > ip.y + h ? p.y - ip.y - h : 0
      return Math.hypot(dx, dy)
    }
    default:
      return Infinity
  }
}

/** 엔티티 축정렬 바운딩박스 (도면 좌표) — 마퀴 선택 히트테스트용 */
function entityBBox(e: CadEntity): { minx: number; miny: number; maxx: number; maxy: number } | null {
  const pts: Pt[] = []
  let r = 0
  let c: Pt | null = null
  switch (e.entityType) {
    case 'line': pts.push(e.startPoint!, e.endPoint!); break
    case 'polyline': pts.push(...e.vertexPoints!); break
    case 'circle': case 'arc': c = e.centerPoint!; r = e.radius!; break
    case 'text': pts.push(e.insertionPoint!); break
    default: return null
  }
  if (c) return { minx: c.x - r, miny: c.y - r, maxx: c.x + r, maxy: c.y + r }
  if (!pts.length) return null
  return {
    minx: Math.min(...pts.map((p) => p.x)), miny: Math.min(...pts.map((p) => p.y)),
    maxx: Math.max(...pts.map((p) => p.x)), maxy: Math.max(...pts.map((p) => p.y)),
  }
}

/** 스냅 후보점 — 끝점·정점·중점·중심 */
function snapPoints(e: CadEntity): Pt[] {
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  switch (e.entityType) {
    case 'line': return [e.startPoint!, e.endPoint!, mid(e.startPoint!, e.endPoint!)]
    case 'polyline': {
      const v = e.vertexPoints!
      const mids = v.slice(1).map((p, i) => mid(v[i], p))
      if (e.isClosed && v.length > 2) mids.push(mid(v[v.length - 1], v[0]))
      return [...v, ...mids]
    }
    case 'circle': return [e.centerPoint!]
    case 'arc': {
      const c = e.centerPoint!
      const r = e.radius!
      const a0 = (e.startAngleDegrees! * Math.PI) / 180
      const a1 = (e.endAngleDegrees! * Math.PI) / 180
      return [c,
        { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) },
        { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }]
    }
    case 'text': return [e.insertionPoint!]
    default: return []
  }
}

/** 선택 엔티티 속성 요약 */
function entityInfo(e: CadEntity): { title: string; rows: [string, string][] } {
  const f = (n: number) => Number(n.toFixed(2)).toLocaleString()
  const pt = (p: Pt) => `(${f(p.x)}, ${f(p.y)})`
  switch (e.entityType) {
    case 'line': {
      const len = dist(e.startPoint!, e.endPoint!)
      return {
        title: 'LINE', rows: [
          ['레이어', e.layerName], ['길이', f(len)],
          ['시작', pt(e.startPoint!)], ['끝', pt(e.endPoint!)],
        ],
      }
    }
    case 'polyline': {
      const v = e.vertexPoints!
      let len = 0
      for (let i = 0; i < v.length - 1; i++) len += dist(v[i], v[i + 1])
      if (e.isClosed && v.length > 2) len += dist(v[v.length - 1], v[0])
      return {
        title: e.isClosed ? 'POLYLINE (닫힘)' : 'POLYLINE', rows: [
          ['레이어', e.layerName], ['정점', String(v.length)], ['총 길이', f(len)],
        ],
      }
    }
    case 'circle':
      return {
        title: 'CIRCLE', rows: [
          ['레이어', e.layerName], ['중심', pt(e.centerPoint!)],
          ['반지름', f(e.radius!)], ['둘레', f(2 * Math.PI * e.radius!)],
        ],
      }
    case 'arc': {
      let sweep = e.endAngleDegrees! - e.startAngleDegrees!
      if (sweep <= 0) sweep += 360
      return {
        title: 'ARC', rows: [
          ['레이어', e.layerName], ['중심', pt(e.centerPoint!)],
          ['반지름', f(e.radius!)], ['각도', `${f(sweep)}°`],
          ['호 길이', f((e.radius! * sweep * Math.PI) / 180)],
        ],
      }
    }
    case 'text':
      return {
        title: 'TEXT', rows: [
          ['레이어', e.layerName], ['내용', e.textContent ?? ''],
          ['높이', f(e.textHeight ?? 10)], ['삽입점', pt(e.insertionPoint!)],
        ],
      }
    default:
      return { title: String(e.entityType).toUpperCase(), rows: [['레이어', e.layerName]] }
  }
}

export interface LayerOverride { color?: string; width?: number }   // B16 특성 편집 (DWG-025)

export interface CadEditOp {
  op: 'move' | 'delete' | 'copy' | 'rotate' | 'mirror' | 'add' | 'trim'
  entityId?: string; dx?: number; dy?: number; angle?: number; axis?: 'x' | 'y'
  entityType?: 'line' | 'circle' | 'rect' | 'dim' | 'block'; layer?: string
  x1?: number; y1?: number; x2?: number; y2?: number; radius?: number
  boundaryId?: string; text?: string
}

type DrawTool = 'line' | 'circle' | 'rect' | 'dim' | 'block'

export function CadSvg(props: {
  doc: CadDocument
  hiddenLayers?: Set<string>
  layerOverrides?: Record<string, LayerOverride>
  /** G1 편집 — 지정 시 ✎ 편집 모드(선택 엔티티 드래그 이동·Delete 삭제) 활성 */
  editable?: boolean
  onEdit?: (ops: CadEditOp[]) => void
  /** 외부 툴바 제어 — move/copy/rotate/mirror/erase/trim/extend/line/circle/rect/properties (소비 후 onToolConsumed) */
  activeTool?: string | null
  onToolConsumed?: () => void
}) {
  const { doc } = props
  const { t } = useI18n()
  const hidden = props.hiddenLayers ?? new Set<string>()
  const overrides = props.layerOverrides ?? {}

  // 맞춤(fit) 뷰박스 — SVG 는 y-반전 그룹으로 그리므로 y 는 [-maxY, -minY]
  const fit = useMemo<VB>(() => {
    const { minX, minY, maxX, maxY } = doc.bounds
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const mx = w * 0.05 + 10
    const my = h * 0.05 + 10
    return { x: minX - mx, y: -maxY - my, w: w + mx * 2, h: h + my * 2 }
  }, [doc])

  const [vb, setVb] = useState<VB | null>(null) // null = 맞춤
  const view = vb ?? fit
  const svgRef = useRef<SVGSVGElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const fitRef = useRef(fit)
  fitRef.current = fit
  const drag = useRef<{ px: number; py: number; vb: VB; scale: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  // 측정·조회 상태 (도면 좌표)
  const [measureOn, setMeasureOn] = useState(false)
  const measureRef = useRef(measureOn)
  measureRef.current = measureOn
  const [m1, setM1] = useState<Pt | null>(null)
  const [m2, setM2] = useState<Pt | null>(null)
  const [mHover, setMHover] = useState<Pt | null>(null)
  const [selId, setSelId] = useState<string | null>(null)   // 주 선택(속성 패널)
  const [selIds, setSelIds] = useState<Set<string>>(new Set())   // 전체 선택 집합(다중)
  const selIdsRef = useRef(selIds)
  selIdsRef.current = selIds
  const [cur, setCur] = useState<Pt | null>(null)   // 실시간 커서 도면 좌표
  const [gridOn, setGridOn] = useState(false)       // 그리드 오버레이
  // G1 편집 모드
  const [editOn, setEditOn] = useState(false)
  const editRef = useRef(editOn)
  editRef.current = editOn && !!props.editable
  const edrag = useRef<{ id: string; sx: number; sy: number } | null>(null)
  const mdrag = useRef<{ ax: number; ay: number } | null>(null)   // 마퀴 앵커(도면 좌표)
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null)
  const [editPreview, setEditPreview] = useState<{ dx: number; dy: number } | null>(null)   // 그룹 이동 프리뷰
  // G1 자유 작도(line/circle/rect)
  const [drawTool, setDrawTool] = useState<null | DrawTool>(null)
  const drawRef = useRef(drawTool)
  drawRef.current = drawTool
  const ddraw = useRef<{ ax: number; ay: number } | null>(null)
  const [drawPreview, setDrawPreview] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null)
  const [snapMark, setSnapMark] = useState<Pt | null>(null)   // 스냅 히트 표시
  const [perpMark, setPerpMark] = useState(false)             // perp(수선) 스냅 여부
  // G1 트림/연장
  const [trimTool, setTrimTool] = useState(false)
  const trimRef = useRef(false)
  trimRef.current = trimTool && !!props.editable
  const [trimBoundary, setTrimBoundary] = useState<string | null>(null)
  const trimBoundaryRef = useRef<string | null>(null)
  trimBoundaryRef.current = trimBoundary
  const selected = useMemo(
    () => (selIds.size === 1 ? doc.entities.find((e) => e.entityId === selId) ?? null : null),
    [doc, selId, selIds])

  // 선택 헬퍼 — selId(주)·selIds(집합) 동기 유지
  const selectOnly = (id: string) => { setSelId(id); setSelIds(new Set([id])) }
  const toggleSel = (id: string) => {
    setSelIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
    setSelId(id)
  }
  const selectMany = (ids: string[]) => { setSelIds(new Set(ids)); setSelId(ids[0] ?? null) }
  const clearSel = () => { setSelId(null); setSelIds(new Set()) }
  const runOps = (make: (id: string) => CadEditOp) => {
    const ids = [...selIdsRef.current]
    if (ids.length) props.onEdit?.(ids.map(make))
  }

  // 문서 변경 시 측정·선택·편집 프리뷰 초기화
  useEffect(() => {
    setM1(null); setM2(null); setMHover(null); clearSel(); setEditPreview(null)
    edrag.current = null; mdrag.current = null; setMarquee(null)
    ddraw.current = null; setDrawPreview(null); setSnapMark(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // 외부 툴바 제어 — activeTool 을 내부 편집 모드/동작으로 매핑
  useEffect(() => {
    const tsel = props.activeTool
    if (!tsel || !props.editable) return
    setEditOn(true); setMeasureOn(false)
    if (tsel === 'trim' || tsel === 'extend') { setTrimTool(true); setDrawTool(null); setTrimBoundary(null) }
    else if (tsel === 'line' || tsel === 'circle' || tsel === 'rect' || tsel === 'dim' || tsel === 'block') { setDrawTool(tsel); setTrimTool(false) }
    else {
      setTrimTool(false); setDrawTool(null)
      const off = Math.max(view.w, view.h) * 0.04
      if (tsel === 'copy') runOps((id) => ({ op: 'copy', entityId: id, dx: off, dy: off }))
      else if (tsel === 'rotate') runOps((id) => ({ op: 'rotate', entityId: id, angle: 90 }))
      else if (tsel === 'mirror') runOps((id) => ({ op: 'mirror', entityId: id, axis: 'y' }))
      else if (tsel === 'erase') { runOps((id) => ({ op: 'delete', entityId: id })); clearSel() }
      // 'move'·'properties' 는 편집 모드 진입만 (선택 후 드래그/클릭)
    }
    props.onToolConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeTool])

  // client px → 도면 단위 스케일 (preserveAspectRatio=meet 기준)
  const pxScale = (v: VB) => {
    const r = svgRef.current!.getBoundingClientRect()
    return Math.max(v.w / r.width, v.h / r.height)
  }

  /** client 좌표 → 도면 좌표 (y-반전 반영) */
  const toDrawing = (clientX: number, clientY: number): Pt => {
    const el = svgRef.current!
    const v = viewRef.current
    const r = el.getBoundingClientRect()
    const s = Math.max(v.w / r.width, v.h / r.height)
    const ox = r.left + (r.width - v.w / s) / 2
    const oy = r.top + (r.height - v.h / s) / 2
    const sx = v.x + (clientX - ox) * s
    const sy = v.y + (clientY - oy) * s
    return { x: sx, y: -sy }
  }

  const visibleEntities = useMemo(
    () => doc.entities.filter((e) => !hidden.has(e.layerName)),
    [doc, hidden])

  /** 스냅 — 화면 10px 이내 끝점/정점/중점/중심 + 선-선 교차점 (hit 여부 포함) */
  const snapHit = (p: Pt): { pt: Pt; hit: boolean } => {
    const tol = pxScale(viewRef.current) * 10
    let best: Pt | null = null
    let bd = tol
    for (const e of visibleEntities) {
      for (const c of snapPoints(e)) {
        const d = dist(p, c)
        if (d < bd) { bd = d; best = c }
      }
    }
    // 교차점 스냅 — 커서 근처 선분들의 교점 (인접 엔티티 한정)
    const near = visibleEntities.filter((e) => (e.entityType === 'line' || e.entityType === 'polyline')
      && entitySegments(e).some((sg) => segDist(p, sg[0], sg[1]) < tol * 2))
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        for (const s1 of entitySegments(near[i])) {
          for (const s2 of entitySegments(near[j])) {
            const x = segSegIntersect(s1[0], s1[1], s2[0], s2[1])
            if (x) { const d = dist(p, x); if (d < bd) { bd = d; best = x } }
          }
        }
      }
    }
    return best ? { pt: best, hit: true } : { pt: p, hit: false }
  }
  const snap = (p: Pt): Pt => snapHit(p).pt
  /** perp(수선) 스냅 — start 에서 커서 근처 선/폴리라인 세그먼트로 내린 수선의 발 */
  const perpHit = (p: Pt, start: Pt): { pt: Pt; hit: boolean } => {
    const tol = pxScale(viewRef.current) * 10
    let best: Pt | null = null
    let bd = tol * 2
    for (const e of visibleEntities) {
      if (e.entityType !== 'line' && e.entityType !== 'polyline') continue
      for (const [a, b] of entitySegments(e)) {
        if (segDist(p, a, b) > tol * 2) continue     // 커서가 이 세그먼트 근처일 때만
        const foot = perpFoot(start, a, b)
        const d = dist(p, foot)
        if (d < bd) { bd = d; best = foot }
      }
    }
    return best ? { pt: best, hit: true } : { pt: p, hit: false }
  }
  // 작도 끝점 — 점스냅 우선 → perp(수선) → Shift=Polar(45° 8방향)
  const drawEnd = (raw: Pt, start: Pt, shift: boolean): { pt: Pt; snapped: boolean; perp?: boolean } => {
    const s = snapHit(raw)
    if (s.hit) return { pt: s.pt, snapped: true }
    if (drawRef.current !== 'circle') {
      const pf = perpHit(raw, start)
      if (pf.hit) return { pt: pf.pt, snapped: true, perp: true }
    }
    if (shift && drawRef.current !== 'circle') {
      const dx = raw.x - start.x, dy = raw.y - start.y
      const len = Math.hypot(dx, dy)
      const step = Math.PI / 4                       // 45° 폴라 스텝
      const ang = Math.round(Math.atan2(dy, dx) / step) * step
      return { pt: { x: start.x + len * Math.cos(ang), y: start.y + len * Math.sin(ang) }, snapped: false }
    }
    return { pt: raw, snapped: false }
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = svgRef.current
    if (!el) return
    const v = viewRef.current
    const f = fitRef.current
    const r = el.getBoundingClientRect()
    const s = Math.max(v.w / r.width, v.h / r.height)
    const ox = r.left + (r.width - v.w / s) / 2
    const oy = r.top + (r.height - v.h / s) / 2
    const px = v.x + (clientX - ox) * s
    const py = v.y + (clientY - oy) * s
    const k = Math.min(Math.max(v.w * factor, f.w / 100), f.w * 10) / v.w
    setVb({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: v.w * k, h: v.h * k })
  }

  const zoomCenter = (factor: number) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  // React 합성 onWheel 은 passive → 네이티브 리스너로 preventDefault
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      zoomAt(ev.clientX, ev.clientY, Math.exp(ev.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // CommandLine 실명령 (B10) — ZOOM/FIT/MEASURE 를 CustomEvent 로 수신
  useEffect(() => {
    const onCmd = (e: Event) => {
      const a = (e as CustomEvent<{ action?: string }>).detail?.action
      if (a === 'zoom-in') zoomCenter(1 / 1.4)
      else if (a === 'zoom-out') zoomCenter(1.4)
      else if (a === 'fit') setVb(null)
      else if (a === 'measure') {
        const next = !measureRef.current
        setMeasureOn(next)
        if (!next) { setM1(null); setM2(null); setMHover(null) }
      }
    }
    window.addEventListener('edim-cad-cmd', onCmd)
    return () => window.removeEventListener('edim-cad-cmd', onCmd)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc.layers.forEach((l) => {
      // 특성 편집 오버라이드 우선 (B16 DWG-025)
      m[l.layerName] = overrides[l.layerName]?.color
        ?? (l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex)
    })
    return m
  }, [doc, overrides])

  // 화면상 선 굵기 일정 유지 — 현재 뷰 크기에 비례
  const strokeW = Math.max(view.w, view.h) / 500
  const px = (n: number) => n * Math.max(view.w, view.h) / 700 // 화면 px 근사 → 도면 단위

  // 그리드 오버레이 — 뷰 폭 기준 nice-step(1/2/5×10ⁿ) 격자선 (SVG 좌표, 원점 축 강조)
  const gridStep = useMemo(() => {
    const raw = Math.max(view.w, view.h) / 12
    if (!(raw > 0)) return 0
    const p = Math.pow(10, Math.floor(Math.log10(raw)))
    const nn = raw / p
    return (nn >= 5 ? 5 : nn >= 2 ? 2 : 1) * p
  }, [view])
  const gridLines = useMemo(() => {
    if (!gridOn || !gridStep) return [] as { x1: number; y1: number; x2: number; y2: number; axis: boolean }[]
    const out: { x1: number; y1: number; x2: number; y2: number; axis: boolean }[] = []
    const s = gridStep
    for (let x = Math.floor(view.x / s) * s; x <= view.x + view.w; x += s)
      out.push({ x1: x, y1: view.y, x2: x, y2: view.y + view.h, axis: Math.abs(x) < s / 2 })
    for (let y = Math.floor(view.y / s) * s; y <= view.y + view.h; y += s)
      out.push({ x1: view.x, y1: y, x2: view.x + view.w, y2: y, axis: Math.abs(y) < s / 2 })
    return out
  }, [gridOn, gridStep, view])

  /** 클릭 위치의 엔티티 조회 (화면 8px 허용) */
  const pick = (p: Pt): CadEntity | null => {
    const tol = pxScale(viewRef.current) * 8
    let best: CadEntity | null = null
    let bd = tol
    for (const e of visibleEntities) {
      const d = entityDist(p, e)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  const handleClick = (clientX: number, clientY: number) => {
    const p = toDrawing(clientX, clientY)
    if (measureRef.current) {
      const sp = snap(p)
      if (m1 === null || m2 !== null) { setM1(sp); setM2(null); setMHover(null) }
      else setM2(sp)
    } else if (trimRef.current) {
      const h = pick(p)
      if (!h) { setTrimBoundary(null); return }
      if (!trimBoundaryRef.current) { setTrimBoundary(h.entityId); return }   // 1) 경계선
      if (h.entityId !== trimBoundaryRef.current)                             // 2) 대상 선 끝 클릭
        props.onEdit?.([{ op: 'trim', entityId: h.entityId, boundaryId: trimBoundaryRef.current, x1: p.x, y1: p.y }])
    } else {
      const h = pick(p)
      if (h) selectOnly(h.entityId); else clearSel()
    }
  }

  const render = (e: CadEntity, isSel: boolean, colorOverride?: string) => {
    const color = colorOverride ?? (isSel ? '#D97706' : (layerColor[e.layerName] ?? '#2B3A55'))
    const wMul = overrides[e.layerName]?.width ?? 1
    const common = {
      stroke: color, strokeWidth: (isSel || colorOverride ? strokeW * 2.5 : strokeW) * wMul, fill: 'none' as const,
    }
    switch (e.entityType) {
      case 'line':
        return <line key={e.entityId} x1={e.startPoint!.x} y1={e.startPoint!.y}
          x2={e.endPoint!.x} y2={e.endPoint!.y} {...common} />
      case 'polyline': {
        const pts = e.vertexPoints!.map((p) => `${p.x},${p.y}`).join(' ')
        return e.isClosed
          ? <polygon key={e.entityId} points={pts} {...common} />
          : <polyline key={e.entityId} points={pts} {...common} />
      }
      case 'circle':
        return <circle key={e.entityId} cx={e.centerPoint!.x} cy={e.centerPoint!.y}
          r={e.radius!} {...common} />
      case 'arc':
        return <path key={e.entityId} d={arcPath(e)} {...common} />
      case 'text':
        return (
          <text key={e.entityId} x={e.insertionPoint!.x} y={-e.insertionPoint!.y}
            fontSize={e.textHeight ?? 10} fill={color}
            transform={`scale(1,-1)${e.rotationDegrees
              ? ` rotate(${-e.rotationDegrees} ${e.insertionPoint!.x} ${-e.insertionPoint!.y})` : ''}`}
            fontFamily="Consolas, monospace">
            {e.textContent}
          </text>
        )
      default:
        return null
    }
  }

  const zoomPct = Math.round((fit.w / view.w) * 100)
  const btn: CSSProperties = {
    width: 22, height: 22, padding: 0, border: '1px solid var(--line)',
    background: '#fff', color: 'var(--txt)', fontSize: 12, lineHeight: '20px',
    cursor: 'pointer', borderRadius: 2,
  }
  const info = selected ? entityInfo(selected) : null

  // 측정 오버레이 좌표 (도면 → SVG: y 부호 반전)
  const mEnd = m2 ?? mHover
  const measureLabel = m1 && mEnd
    ? `${Number(dist(m1, mEnd).toFixed(2)).toLocaleString()}  (Δx ${Number(Math.abs(mEnd.x - m1.x).toFixed(2)).toLocaleString()} · Δy ${Number(Math.abs(mEnd.y - m1.y).toFixed(2)).toLocaleString()})`
    : null

  return (
    <div tabIndex={-1} data-cad-wrap
      style={{ position: 'relative', width: '100%', height: '100%', outline: 'none' }}
      onMouseEnter={(e) => e.currentTarget.focus()}
      onKeyDown={(e) => {
        // 캔버스 단축키 — 포커스(마우스 진입) 시에만: +/− 줌 · 0 맞춤 · M 측정 · Esc 해제
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomCenter(1 / 1.4) }
        else if (e.key === '-') { e.preventDefault(); zoomCenter(1.4) }
        else if (e.key === '0') { e.preventDefault(); setVb(null) }
        else if (e.key.toLowerCase() === 'm') {
          e.preventDefault()
          const next = !measureOn
          setMeasureOn(next)
          if (!next) { setM1(null); setM2(null); setMHover(null) }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && props.editable && editOn && selIds.size) {
          // 편집 모드 — 선택 엔티티(전체) 삭제 (전역 F3 로 전파 차단)
          e.preventDefault(); e.nativeEvent.stopImmediatePropagation()
          runOps((id) => ({ op: 'delete', entityId: id })); clearSel()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setM1(null); setM2(null); setMHover(null); clearSel(); setDrawTool(null); ddraw.current = null; setDrawPreview(null); setSnapMark(null); setTrimTool(false); setTrimBoundary(null)
        }
      }}>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        data-cad-svg
        style={{
          display: 'block', touchAction: 'none',
          cursor: (measureOn || drawTool) ? 'crosshair' : dragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return
          e.currentTarget.setPointerCapture(e.pointerId)
          if (drawRef.current && e.button === 0) {   // 자유 작도 시작 (스냅)
            const s = snapHit(toDrawing(e.clientX, e.clientY))
            ddraw.current = { ax: s.pt.x, ay: s.pt.y }
            setDrawPreview({ ax: s.pt.x, ay: s.pt.y, bx: s.pt.x, by: s.pt.y })
            setSnapMark(s.hit ? s.pt : null)
            return
          }
          const editing = editRef.current && !measureRef.current && !trimRef.current
          if (editing && e.button === 0) {
            const p = toDrawing(e.clientX, e.clientY)
            const hit = pick(p)
            if (hit) {
              if (e.shiftKey) { toggleSel(hit.entityId); return }   // 다중 토글
              if (!selIdsRef.current.has(hit.entityId)) selectOnly(hit.entityId)
              else setSelId(hit.entityId)
              edrag.current = { id: hit.entityId, sx: e.clientX, sy: e.clientY }
              return
            }
            // 빈 영역 좌드래그 = 마퀴 선택 (팬은 중버튼)
            mdrag.current = { ax: p.x, ay: p.y }
            setMarquee({ ax: p.x, ay: p.y, bx: p.x, by: p.y })
            return
          }
          drag.current = {
            px: e.clientX, py: e.clientY, vb: viewRef.current,
            scale: pxScale(viewRef.current), moved: false,
          }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          setCur(toDrawing(e.clientX, e.clientY))   // 실시간 좌표
          if (ddraw.current) {
            const start = { x: ddraw.current.ax, y: ddraw.current.ay }
            const end = drawEnd(toDrawing(e.clientX, e.clientY), start, e.shiftKey)
            setDrawPreview({ ax: start.x, ay: start.y, bx: end.pt.x, by: end.pt.y })
            setSnapMark(end.snapped ? end.pt : null)
            setPerpMark(!!end.perp)
            return
          }
          if (edrag.current) {
            const s = edrag.current
            const a = toDrawing(s.sx, s.sy)
            const b = toDrawing(e.clientX, e.clientY)
            setEditPreview({ dx: b.x - a.x, dy: b.y - a.y })
            return
          }
          if (mdrag.current) {
            const p = toDrawing(e.clientX, e.clientY)
            setMarquee({ ax: mdrag.current.ax, ay: mdrag.current.ay, bx: p.x, by: p.y })
            return
          }
          const d = drag.current
          if (d) {
            if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) d.moved = true
            if (d.moved) setVb({
              ...d.vb,
              x: d.vb.x - (e.clientX - d.px) * d.scale,
              y: d.vb.y - (e.clientY - d.py) * d.scale,
            })
          } else if (measureRef.current && m1 !== null && m2 === null) {
            setMHover(snap(toDrawing(e.clientX, e.clientY)))
          }
        }}
        onPointerUp={(e) => {
          if (ddraw.current) {
            const a = ddraw.current
            ddraw.current = null
            const b = drawEnd(toDrawing(e.clientX, e.clientY), { x: a.ax, y: a.ay }, e.shiftKey).pt
            setDrawPreview(null); setSnapMark(null); setPerpMark(false)
            const tool = drawRef.current
            const lyr = doc.layers[0]?.layerName ?? '0'
            if (tool === 'line' && Math.hypot(b.x - a.ax, b.y - a.ay) > pxScale(viewRef.current) * 3)
              props.onEdit?.([{ op: 'add', entityType: 'line', layer: lyr, x1: a.ax, y1: a.ay, x2: b.x, y2: b.y }])
            else if (tool === 'circle') {
              const r = Math.hypot(b.x - a.ax, b.y - a.ay)
              if (r > pxScale(viewRef.current) * 3)
                props.onEdit?.([{ op: 'add', entityType: 'circle', layer: lyr, x1: a.ax, y1: a.ay, radius: r }])
            } else if (tool === 'rect' && Math.abs(b.x - a.ax) > pxScale(viewRef.current) * 3 && Math.abs(b.y - a.ay) > pxScale(viewRef.current) * 3)
              props.onEdit?.([{ op: 'add', entityType: 'rect', layer: lyr, x1: a.ax, y1: a.ay, x2: b.x, y2: b.y }])
            else if (tool === 'dim' && Math.hypot(b.x - a.ax, b.y - a.ay) > pxScale(viewRef.current) * 3)
              props.onEdit?.([{ op: 'add', entityType: 'dim', x1: a.ax, y1: a.ay, x2: b.x, y2: b.y }])
            else if (tool === 'block' && Math.abs(b.x - a.ax) > pxScale(viewRef.current) * 3 && Math.abs(b.y - a.ay) > pxScale(viewRef.current) * 3)
              props.onEdit?.([{ op: 'add', entityType: 'block', x1: a.ax, y1: a.ay, x2: b.x, y2: b.y, text: 'BLOCK' }])
            return
          }
          if (edrag.current) {
            const s = edrag.current
            edrag.current = null
            const a = toDrawing(s.sx, s.sy)
            const b = toDrawing(e.clientX, e.clientY)
            const dx = b.x - a.x, dy = b.y - a.y
            setEditPreview(null)
            if (Math.hypot(dx, dy) > pxScale(viewRef.current) * 3)   // 오차 초과 = 이동(선택 전체)
              runOps((id) => ({ op: 'move', entityId: id, dx, dy }))
            return
          }
          if (mdrag.current) {
            const m0 = mdrag.current
            mdrag.current = null
            const b = toDrawing(e.clientX, e.clientY)
            setMarquee(null)
            if (Math.hypot(b.x - m0.ax, b.y - m0.ay) < pxScale(viewRef.current) * 3) { clearSel(); return }
            const rminx = Math.min(m0.ax, b.x), rmaxx = Math.max(m0.ax, b.x)
            const rminy = Math.min(m0.ay, b.y), rmaxy = Math.max(m0.ay, b.y)
            const ids = visibleEntities.filter((en) => {
              const bb = entityBBox(en)
              return bb ? !(bb.maxx < rminx || bb.minx > rmaxx || bb.maxy < rminy || bb.miny > rmaxy) : false
            }).map((en) => en.entityId)
            selectMany(ids)
            return
          }
          const d = drag.current
          drag.current = null
          setDragging(false)
          if (d && !d.moved) handleClick(e.clientX, e.clientY)
        }}
        onPointerCancel={() => {
          drag.current = null; edrag.current = null; mdrag.current = null; ddraw.current = null
          setEditPreview(null); setMarquee(null); setDrawPreview(null); setSnapMark(null); setDragging(false)
        }}
        onPointerLeave={() => { setCur(null); setSnapMark(null) }}
        onDoubleClick={() => { if (!measureRef.current) setVb(null) }}>
        {gridOn ? (
          <g data-cad-grid>
            {gridLines.map((ln, i) => (
              <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                stroke={ln.axis ? '#B9C4D6' : '#E3E8F0'} strokeWidth={strokeW * (ln.axis ? 0.9 : 0.5)} />
            ))}
          </g>
        ) : null}
        <g transform="scale(1,-1)">
          {visibleEntities.filter((e) => !selIds.has(e.entityId)).map((e) => render(e, false))}
          {editPreview ? (
            <g transform={`translate(${editPreview.dx} ${editPreview.dy})`}>
              {visibleEntities.filter((e) => selIds.has(e.entityId) && !hidden.has(e.layerName)).map((e) => render(e, true))}
            </g>
          ) : (
            visibleEntities.filter((e) => selIds.has(e.entityId) && !hidden.has(e.layerName)).map((e) => render(e, true))
          )}
          {marquee ? (
            <rect data-cad-marquee
              x={Math.min(marquee.ax, marquee.bx)} y={Math.min(marquee.ay, marquee.by)}
              width={Math.abs(marquee.bx - marquee.ax)} height={Math.abs(marquee.by - marquee.ay)}
              fill="rgba(47,148,99,.13)" stroke="#2F9463" strokeWidth={strokeW}
              strokeDasharray={`${px(5)} ${px(3)}`} />
          ) : null}
          {drawPreview ? (() => {
            const d = drawPreview
            const cm = { stroke: '#2F9463', strokeWidth: strokeW * 1.5, fill: 'none' as const, strokeDasharray: `${px(5)} ${px(3)}` }
            if (drawTool === 'line' || drawTool === 'dim') return <line data-cad-draw x1={d.ax} y1={d.ay} x2={d.bx} y2={d.by} {...cm} />
            if (drawTool === 'circle') return <circle data-cad-draw cx={d.ax} cy={d.ay} r={Math.hypot(d.bx - d.ax, d.by - d.ay)} {...cm} />
            return <rect data-cad-draw x={Math.min(d.ax, d.bx)} y={Math.min(d.ay, d.by)}
              width={Math.abs(d.bx - d.ax)} height={Math.abs(d.by - d.ay)} {...cm} />
          })() : null}
          {snapMark ? (
            <g data-cad-snap {...(perpMark ? { 'data-cad-perp': true } : {})}>
              <rect x={snapMark.x - px(5)} y={snapMark.y - px(5)} width={px(10)} height={px(10)}
                fill="none" stroke={perpMark ? '#2563EB' : '#E0A100'} strokeWidth={strokeW * 1.6} />
              {perpMark ? (
                // ⊥ 수선 스냅 글리프 (세로 stem + 가로 base)
                <>
                  <line x1={snapMark.x} y1={snapMark.y - px(3.5)} x2={snapMark.x} y2={snapMark.y + px(3.5)}
                    stroke="#2563EB" strokeWidth={strokeW * 1.3} />
                  <line x1={snapMark.x - px(3.5)} y1={snapMark.y + px(3.5)} x2={snapMark.x + px(3.5)} y2={snapMark.y + px(3.5)}
                    stroke="#2563EB" strokeWidth={strokeW * 1.3} />
                </>
              ) : null}
            </g>
          ) : null}
          {trimBoundary ? (() => {
            const be = visibleEntities.find((e) => e.entityId === trimBoundary && !hidden.has(e.layerName))
            return be ? <g data-cad-trim-boundary>{render(be, false, '#2563EB')}</g> : null
          })() : null}
        </g>
        {/* 측정 오버레이 — 도면 좌표 (y 부호 반전) */}
        {m1 && mEnd ? (
          <g data-cad-measure>
            <line x1={m1.x} y1={-m1.y} x2={mEnd.x} y2={-mEnd.y}
              stroke="#B3372F" strokeWidth={strokeW * 1.4} strokeDasharray={`${px(6)} ${px(4)}`} />
            <circle cx={m1.x} cy={-m1.y} r={px(3.5)} fill="#B3372F" />
            <circle cx={mEnd.x} cy={-mEnd.y} r={px(3.5)} fill={m2 ? '#B3372F' : 'none'}
              stroke="#B3372F" strokeWidth={strokeW * 1.4} />
          </g>
        ) : m1 ? (
          <circle cx={m1.x} cy={-m1.y} r={px(3.5)} fill="#B3372F" data-cad-measure />
        ) : null}
      </svg>
      {/* 우상단 — 줌·측정 컨트롤 */}
      <div style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3,
        alignItems: 'center', userSelect: 'none',
      }}>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)', background: '#ffffffcc', padding: '2px 5px', borderRadius: 2 }}>
          {zoomPct}%
        </span>
        <button type="button" style={btn} title="확대" data-cad-zoom-in
          onClick={() => zoomCenter(1 / 1.4)}>＋</button>
        <button type="button" style={btn} title="축소" data-cad-zoom-out
          onClick={() => zoomCenter(1.4)}>－</button>
        <button type="button" style={btn} title={t('cad.fitTitle', '맞춤 (더블클릭)')} data-cad-fit
          onClick={() => setVb(null)}>⌂</button>
        {props.editable ? (
          <button type="button" data-cad-edit-toggle
            style={{
              ...btn, width: 'auto', padding: '0 7px', fontSize: 10.5,
              ...(editOn ? { background: '#2F9463', color: '#fff', borderColor: '#2F9463' } : {}),
            }}
            title={t('cad.editTitle', '편집 — 엔티티 드래그 이동 · Delete 삭제')}
            onClick={() => {
              const next = !editOn
              setEditOn(next)
              if (next) { setMeasureOn(false); setM1(null); setM2(null); setMHover(null) }
              else { edrag.current = null; mdrag.current = null; setEditPreview(null); setMarquee(null); setDrawTool(null); setTrimTool(false); setTrimBoundary(null) }
            }}>✎ {t('cad.edit', '편집')}</button>
        ) : null}
        {props.editable && editOn ? (
          <>
            {([['line', '／', '선'], ['circle', '○', '원'], ['rect', '▭', '사각']] as const).map(([tool, icon, label]) => (
              <button key={tool} type="button" data-cad-draw-tool={tool}
                style={{ ...btn, width: 'auto', padding: '0 6px', fontSize: 11, ...(drawTool === tool ? { background: '#2F9463', color: '#fff', borderColor: '#2F9463' } : {}) }}
                title={`작도 — ${label} (드래그)`}
                onClick={() => { setTrimTool(false); setTrimBoundary(null); setDrawTool((cur) => (cur === tool ? null : tool)) }}>{icon}</button>
            ))}
            <button type="button" data-cad-trim-toggle
              style={{ ...btn, width: 'auto', padding: '0 6px', fontSize: 11, ...(trimTool ? { background: '#2563EB', color: '#fff', borderColor: '#2563EB' } : {}) }}
              title={t('cad.trimTitle', '트림/연장 — 경계선 클릭 후 대상 선 끝 클릭')}
              onClick={() => { setDrawTool(null); setTrimBoundary(null); setTrimTool((o) => !o) }}>✂</button>
          </>
        ) : null}
        <button type="button" data-cad-grid-toggle
          style={{ ...btn, ...(gridOn ? { background: '#26406E', color: '#fff', borderColor: '#26406E' } : {}) }}
          title={t('cad.gridTitle', '그리드 오버레이')}
          onClick={() => setGridOn((o) => !o)}>▦</button>
        <button type="button" data-cad-measure-toggle
          style={{
            ...btn, width: 'auto', padding: '0 7px', fontSize: 10.5,
            ...(measureOn ? { background: '#B3372F', color: '#fff', borderColor: '#B3372F' } : {}),
          }}
          title="측정 — 두 점 클릭 (끝점·중심 스냅)"
          onClick={() => {
            const next = !measureOn
            setMeasureOn(next)
            if (!next) { setM1(null); setM2(null); setMHover(null) }
          }}>📏 {t('cad.measure', '측정')}</button>
      </div>
      {/* 우하단 — 실시간 커서 도면 좌표 (측정 라벨과 겹치지 않게 힌트 위) */}
      {cur ? (
        <div data-cad-coord style={{
          position: 'absolute', bottom: 26, right: 8, fontSize: 10,
          fontFamily: 'Consolas, monospace', color: 'var(--txt)', background: '#ffffffee',
          border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 2,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          X {Number(cur.x.toFixed(1)).toLocaleString()}  Y {Number(cur.y.toFixed(1)).toLocaleString()}
          {gridOn && gridStep ? <span style={{ color: 'var(--txt-mute)' }}>  · grid {Number(gridStep).toLocaleString()}</span> : null}
        </div>
      ) : null}
      {/* 좌하단 — 측정 결과 / 엔티티 속성 */}
      {measureLabel ? (
        <div data-cad-measure-label style={{
          position: 'absolute', bottom: 6, left: 8, fontSize: 11,
          fontFamily: 'Consolas, monospace', color: '#B3372F', background: '#ffffffee',
          border: '1px solid #B3372F', padding: '3px 8px', borderRadius: 2, userSelect: 'none',
        }}>
          📏 {measureLabel}{m2 ? '' : ' …'}
        </div>
      ) : selIds.size ? (
        <div data-cad-entity-info style={{
          position: 'absolute', bottom: 6, left: 8, fontSize: 10.5,
          background: '#ffffffee', border: '1px solid var(--line)', borderRadius: 2,
          padding: '5px 9px', minWidth: 170, lineHeight: 1.7, userSelect: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <b style={{ color: '#D97706' }}>{info ? info.title : `${selIds.size}개 선택`}</b>
            <span style={{ flex: 1 }} />
            {props.editable && editOn ? (
              <>
                <span data-cad-copy style={{ cursor: 'pointer' }} title="복사"
                  onClick={() => { const off = Math.max(view.w, view.h) * 0.04; runOps((id) => ({ op: 'copy', entityId: id, dx: off, dy: off })) }}>⧉</span>
                <span data-cad-rotate style={{ cursor: 'pointer' }} title="회전 90°"
                  onClick={() => runOps((id) => ({ op: 'rotate', entityId: id, angle: 90 }))}>⟳</span>
                <span data-cad-mirror style={{ cursor: 'pointer' }} title="좌우 반전(수직축)"
                  onClick={() => runOps((id) => ({ op: 'mirror', entityId: id, axis: 'y' }))}>⇋</span>
                <span data-cad-delete style={{ cursor: 'pointer', color: '#B3372F' }} title="삭제 (Delete)"
                  onClick={() => { runOps((id) => ({ op: 'delete', entityId: id })); clearSel() }}>🗑</span>
              </>
            ) : null}
            <span style={{ cursor: 'pointer', color: 'var(--txt-mute)' }}
              onClick={clearSel}>✕</span>
          </div>
          {info ? info.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--txt-mute)', width: 44, flex: 'none' }}>{k}</span>
              <span style={{ fontFamily: 'Consolas, monospace' }}>{v}</span>
            </div>
          )) : null}
        </div>
      ) : null}
      <div style={{
        position: 'absolute', bottom: 6, right: 8, fontSize: 10,
        color: 'var(--txt-mute)', background: '#ffffffcc', padding: '2px 6px',
        borderRadius: 2, pointerEvents: 'none', userSelect: 'none',
      }}>
        {measureOn
          ? t('cad.measureHint', '두 점 클릭 = 거리 측정 · 끝점/중점/중심/교차점 스냅')
          : trimTool
            ? t('cad.trimHint', `트림/연장 — ${trimBoundary ? '대상 선의 조정할 끝 근처 클릭' : '경계선 클릭'} · Esc 취소`)
            : drawTool
              ? t('cad.drawHint', '드래그 = 작도 · 끝점/중점/중심/교차점 스냅 · Shift=Polar(45°) · Esc')
            : editOn
              ? t('cad.editHint', '엔티티 드래그=이동 · 빈곳 드래그=박스선택 · Shift+클릭=추가 · 중클릭=팬 · Delete=삭제')
              : t('cad.hint', '휠 줌 · 드래그 이동 · 더블클릭 맞춤 · 클릭 = 속성')}
        {' · +/−/0/M/Esc'}
      </div>
    </div>
  )
}
