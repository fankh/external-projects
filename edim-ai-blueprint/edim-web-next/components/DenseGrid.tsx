'use client'

/** 레거시 그리드 — 24px 행·양방향 실선·줄무늬·선택 옐로·합계 푸터 (디자인시안 .g).
 *  F8 — 헤더 클릭 정렬 (none→asc→desc 토글, ▲▼ 표시): 원본 인덱스를 보존해
 *  rowKey/onRowClick/selectedKey 가 정렬과 무관하게 동작한다 (index 기반 선택 화면 안전).
 *  정렬값: col.sortValue > render 원시값(string/number) — JSX 셀은 sortValue 미지정 시 정렬 제외.
 *  G2 — 그리드 내 찾기(Ctrl+F, 보이는 셀 텍스트 부분일치 필터) · 공용 다중행 선택(multiSelect: 체크박스 열·Shift 범위·전체선택). */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { prefService } from '@/lib/prefClient'
import { downloadCsv } from '@/lib/csv'

export interface GridColumn<T> {
  key: string
  header: ReactNode
  width?: number
  align?: 'left' | 'center' | 'right'
  code?: boolean
  render: (row: T, index: number) => ReactNode
  /** 정렬 기준값 — 미지정 시 render 가 원시값을 내면 그 값 사용, JSX 면 정렬 비활성 */
  sortValue?: (row: T) => string | number | null
  /** 명시적 정렬 비활성 (액션 열 등) */
  noSort?: boolean
  /** G2 — 인라인 셀 편집(더블클릭). onCellEdit 과 함께 사용 · editValue 로 편집 초기값 지정 */
  editable?: boolean
  editValue?: (row: T) => string
  /** G2 — 헤더 컬럼 필터 제외(액션·자유텍스트 열 등). colFilter 활성 시에만 의미 */
  noFilter?: boolean
}

type SortDir = 'asc' | 'desc'
type Key = string | number

export function DenseGrid<T>(props: {
  columns: GridColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => Key
  selectedKey?: Key | null
  onRowClick?: (row: T, index: number) => void
  onRowDoubleClick?: (row: T, index: number) => void
  footer?: ReactNode        // <tr> 내용
  mono?: boolean
  style?: CSSProperties
  /** D8 — 지정 시 컬럼 표시/숨김 ⚙ 토글 + 서버 영속(prefs gridColumns[prefKey]) */
  prefKey?: string
  /** G2 — 그리드 내 찾기 비활성(기본 활성) */
  findable?: boolean
  /** G2 — 페이지당 행수(미지정 시 150행 초과하면 자동 100행 페이지네이션) */
  pageSize?: number
  /** G2 — 공용 다중행 선택(체크박스 열). selectedKeys/onSelectionChange 와 함께 사용 */
  multiSelect?: boolean
  selectedKeys?: Set<Key>
  onSelectionChange?: (keys: Set<Key>) => void
  /** G2 — 행 우클릭 컨텍스트 메뉴 액션 (셀/행 복사는 기본 제공) */
  rowActions?: (row: T, index: number) => { label: string; onClick: () => void; danger?: boolean }[]
  /** G2 — 첫 데이터 컬럼 고정(가로 스크롤 시 식별 열 유지) */
  stickyFirst?: boolean
  /** G2 — 인라인 셀 편집 커밋 (column.editable 열 더블클릭 → 입력 → Enter/blur) */
  onCellEdit?: (row: T, index: number, key: string, value: string) => void
  /** G2 — 헤더 컬럼 필터(Excel autofilter식 값 체크리스트). 컬럼별 noFilter 로 제외 */
  colFilter?: boolean
  /** G2 — 로딩 상태 표준(헤더 유지 + 중앙 로딩 표시). rows 는 [] 로 전달. 문자열 지정 시 커스텀 문구 */
  loading?: boolean | string
  /** G2 — 빈 상태 표준 메시지(rows 비었고 loading 아닐 때 중앙 표시). 미지정 시 빈 tbody */
  emptyText?: ReactNode
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)
  // D8 — 컬럼 표시 설정
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [colMenu, setColMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const colRef = useRef<HTMLSpanElement>(null)
  // G2 — 헤더 컬럼 필터 (Excel autofilter식 값 체크리스트)
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({})
  const [fltOpen, setFltOpen] = useState<{ key: string; top: number; left: number } | null>(null)
  const [fltSearch, setFltSearch] = useState('')
  const [fltDraft, setFltDraft] = useState<Set<string>>(new Set())
  // G2 — 그리드 내 찾기
  const findable = props.findable !== false
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)   // G2 — 페이지네이션(0-based)
  const findInputRef = useRef<HTMLInputElement>(null)
  // G2 — 다중 선택 Shift 범위 앵커(shown 인덱스)
  const anchorRef = useRef<number | null>(null)
  // G2 — 컬럼 리사이즈/순서 (prefKey 영속)
  const [colW, setColW] = useState<Record<string, number>>({})
  const [colOrder, setColOrder] = useState<string[]>([])
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const dragCol = useRef<string | null>(null)
  // G2 — 인라인 셀 편집
  const [editing, setEditing] = useState<{ row: T; idx: number; key: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  // G2 — 우클릭 컨텍스트 메뉴
  const [ctx, setCtx] = useState<{ x: number; y: number; actions: { label: string; onClick: () => void; danger?: boolean }[] } | null>(null)
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', close) }
  }, [ctx])

  const persistPref = (bucket: string, val: unknown) => {
    if (!props.prefKey) return
    void prefService.get<Record<string, unknown>>(bucket).then((m) => {
      const map = (m && typeof m === 'object') ? { ...m } : {}
      map[props.prefKey!] = val
      void prefService.set(bucket, map)
    })
  }

  useEffect(() => {
    if (!props.prefKey) return
    void prefService.get<Record<string, string[]>>('gridColumns').then((m) => {
      const h = m && m[props.prefKey!]
      if (Array.isArray(h)) setHidden(new Set(h))
    })
    void prefService.get<Record<string, Record<string, number>>>('gridColWidths').then((m) => {
      const w = m && m[props.prefKey!]
      if (w && typeof w === 'object') setColW(w)
    })
    void prefService.get<Record<string, string[]>>('gridColOrder').then((m) => {
      const o = m && m[props.prefKey!]
      if (Array.isArray(o)) setColOrder(o)
    })
  }, [props.prefKey])

  // 컬럼 리사이즈 — 헤더 우측 핸들 드래그(window 리스너)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current
      if (!r) return
      const w = Math.max(40, r.startW + (e.clientX - r.startX))
      setColW((prev) => ({ ...prev, [r.key]: w }))
    }
    const onUp = () => {
      if (resizeRef.current) { resizeRef.current = null; setColW((w) => { persistPref('gridColWidths', w); return w }) }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prefKey])

  const reorderCol = (from: string, to: string) => {
    const order = (colOrder.length ? colOrder : props.columns.map((c) => c.key)).filter((k) => k !== from)
    const at = order.indexOf(to)
    order.splice(at < 0 ? order.length : at, 0, from)
    setColOrder(order)
    persistPref('gridColOrder', order)
  }
  useEffect(() => {
    if (!colMenu) return
    const onDoc = (e: MouseEvent) => {
      if (colRef.current && !colRef.current.contains(e.target as Node)) setColMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [colMenu])
  const toggleCol = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      if (props.prefKey) {
        void prefService.get<Record<string, string[]>>('gridColumns').then((m) => {
          const map = (m && typeof m === 'object') ? { ...m } : {}
          map[props.prefKey!] = [...next]
          void prefService.set('gridColumns', map)
        })
      }
      return next
    })
  }
  const ordered = colOrder.length
    ? [...props.columns].sort((a, b) => {
      const ia = colOrder.indexOf(a.key), ib = colOrder.indexOf(b.key)
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib)
    })
    : props.columns
  const cols = props.prefKey ? ordered.filter((c) => !hidden.has(c.key)) : ordered

  const tdClass = (c: GridColumn<T>) => {
    const cls: string[] = []
    if (c.align === 'center') cls.push('c')
    if (c.align === 'right') cls.push('num')
    if (c.code) cls.push('code')
    return cls.join(' ') || undefined
  }

  // 열의 정렬값 추출 — sortValue 우선, 없으면 render 원시값 (JSX = null → 정렬 불가)
  const valueOf = (c: GridColumn<T>, row: T, idx: number): string | number | null => {
    if (c.sortValue) return c.sortValue(row)
    const v = c.render(row, idx)
    return typeof v === 'string' || typeof v === 'number' ? v : null
  }

  const sortableOf = (c: GridColumn<T>): boolean => {
    if (c.noSort) return false
    if (c.sortValue) return true
    if (!props.rows.length) return false
    const v = c.render(props.rows[0], 0)
    return typeof v === 'string' || typeof v === 'number'
  }

  // 원본 인덱스 보존 정렬 — 화면의 rows[index] 참조가 항상 유효
  const view = useMemo(() => {
    const decorated = props.rows.map((row, origIdx) => ({ row, origIdx }))
    if (!sort) return decorated
    const col = props.columns.find((c) => c.key === sort.key)
    if (!col) return decorated
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...decorated].sort((a, b) => {
      const va = valueOf(col, a.row, a.origIdx)
      const vb = valueOf(col, b.row, b.origIdx)
      if (va === null && vb === null) return 0
      if (va === null) return 1          // 값 없는 행은 항상 뒤로
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'ko', { numeric: true }) * dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rows, props.columns, sort])

  // 셀의 검색·CSV 텍스트(원시값/sortValue, JSX 는 '')
  const cellText = (c: GridColumn<T>, row: T, idx: number): string | number => {
    if (c.sortValue) { const v = c.sortValue(row); return v == null ? '' : v }
    const r = c.render(row, idx)
    return (typeof r === 'string' || typeof r === 'number') ? r : ''
  }

  // G2 — 헤더 컬럼 필터: 각 컬럼의 고유값(비어있지 않은) 목록
  const distinctValues = (c: GridColumn<T>): string[] => {
    const set = new Set<string>()
    props.rows.forEach((row, i) => {
      const v = String(cellText(c, row, i))
      if (v !== '') set.add(v)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
  }
  const filterableOf = (c: GridColumn<T>) =>
    !!props.colFilter && !c.noFilter && distinctValues(c).length > 1
  const activeFilterKeys = Object.keys(colFilters).filter((k) => colFilters[k]?.size)

  // G2 — 찾기 필터(보이는 컬럼 텍스트 부분일치) + 컬럼 필터(값 체크리스트, AND)
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    let out = view
    if (activeFilterKeys.length) {
      out = out.filter(({ row, origIdx }) => activeFilterKeys.every((k) => {
        const c = cols.find((cc) => cc.key === k)
        if (!c) return true
        return colFilters[k].has(String(cellText(c, row, origIdx)))
      }))
    }
    if (q) {
      out = out.filter(({ row, origIdx }) =>
        cols.some((c) => String(cellText(c, row, origIdx)).toLowerCase().includes(q)))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, q, cols, colFilters])

  // G2 — 페이지네이션: 150행 초과 시 자동 100행/페이지 (소규모 그리드는 단일 페이지=기존 동작)
  const effPage = props.pageSize ?? (shown.length > 150 ? 100 : (shown.length || 1))
  const pageCount = Math.max(1, Math.ceil(shown.length / effPage))
  const curPage = Math.min(page, pageCount - 1)
  const pageStart = curPage * effPage
  const pageRows = shown.slice(pageStart, pageStart + effPage)
  useEffect(() => { setPage(0) }, [q, colFilters])

  const clickHeader = (c: GridColumn<T>) => {
    if (!sortableOf(c)) return
    setSort((cur) => {
      if (!cur || cur.key !== c.key) return { key: c.key, dir: 'asc' }
      if (cur.dir === 'asc') return { key: c.key, dir: 'desc' }
      return null   // desc → 원래 순서
    })
  }

  // G2 — 키보드 행 내비게이션 (↑↓·Home/End·PgUp/Dn·Enter=열기)
  const gridRef = useRef<HTMLTableElement>(null)
  const navigate = (delta: number) => {
    if (!props.onRowClick || shown.length === 0) return
    const cur = shown.findIndex(({ row, origIdx }) => props.rowKey(row, origIdx) === props.selectedKey)
    const next = Math.max(0, Math.min(shown.length - 1, (cur < 0 ? 0 : cur + delta)))
    const np = Math.floor(next / effPage)
    if (np !== curPage) setPage(np)   // 페이지 경계 넘어가면 자동 이동
    props.onRowClick(shown[next].row, shown[next].origIdx)
  }
  const openFind = () => { setFindOpen(true); setTimeout(() => findInputRef.current?.focus(), 0) }
  const closeFind = () => { setFindOpen(false); setQuery(''); gridRef.current?.focus() }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    // 찾기: 그리드 포커스 시 Ctrl+F 가 전역 검색 대신 그리드 내 찾기
    if (findable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault(); e.stopPropagation(); openFind(); return
    }
    if (e.key === 'Escape' && findOpen) { e.preventDefault(); closeFind(); return }
    if (!props.onRowClick) return
    const k = e.key
    if (k === 'ArrowDown') { e.preventDefault(); navigate(1) }
    else if (k === 'ArrowUp') { e.preventDefault(); navigate(-1) }
    else if (k === 'Home') { e.preventDefault(); navigate(-1e9) }
    else if (k === 'End') { e.preventDefault(); navigate(1e9) }
    else if (k === 'PageDown') { e.preventDefault(); navigate(10) }
    else if (k === 'PageUp') { e.preventDefault(); navigate(-10) }
    else if (k === 'Enter' && props.onRowDoubleClick) {
      const cur = shown.find(({ row, origIdx }) => props.rowKey(row, origIdx) === props.selectedKey)
      if (cur) { e.preventDefault(); props.onRowDoubleClick(cur.row, cur.origIdx) }
    }
  }
  useEffect(() => {
    gridRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' })
  }, [props.selectedKey])

  // G2 — 다중 선택
  const selKeys = props.selectedKeys
  const isSel = (k: Key) => !!selKeys?.has(k)
  const emit = (next: Set<Key>) => props.onSelectionChange?.(next)
  const toggleOne = (k: Key) => {
    const next = new Set(selKeys ?? [])
    if (next.has(k)) next.delete(k); else next.add(k)
    emit(next)
  }
  const selectRange = (aIdx: number, bIdx: number) => {
    const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx]
    const next = new Set(selKeys ?? [])
    for (let i = lo; i <= hi; i++) next.add(props.rowKey(shown[i].row, shown[i].origIdx))
    emit(next)
  }
  const allShownSel = shown.length > 0 && shown.every(({ row, origIdx }) => isSel(props.rowKey(row, origIdx)))
  const someShownSel = shown.some(({ row, origIdx }) => isSel(props.rowKey(row, origIdx)))
  const toggleAllShown = () => {
    const next = new Set(selKeys ?? [])
    if (allShownSel) shown.forEach(({ row, origIdx }) => next.delete(props.rowKey(row, origIdx)))
    else shown.forEach(({ row, origIdx }) => next.add(props.rowKey(row, origIdx)))
    emit(next)
  }

  // G2 — 보이는 컬럼·정렬 순서·찾기 필터 그대로 CSV 내보내기
  const exportCsv = () => {
    downloadCsv(props.prefKey || 'grid',
      cols.map((c) => (typeof c.header === 'string' ? c.header : c.key)),
      shown.map(({ row, origIdx }) => cols.map((c) => cellText(c, row, origIdx))))
  }

  const openCtx = (e: ReactMouseEvent, row: T, idx: number, c: GridColumn<T>) => {
    e.preventDefault()
    const cellStr = String(cellText(c, row, idx))
    const rowTsv = cols.map((cc) => String(cellText(cc, row, idx))).join('\t')
    const acts = [
      { label: '셀 복사', onClick: () => void navigator.clipboard?.writeText(cellStr) },
      { label: '행 복사(TSV)', onClick: () => void navigator.clipboard?.writeText(rowTsv) },
      ...(props.rowActions?.(row, idx) ?? []),
    ]
    setCtx({ x: e.clientX, y: e.clientY, actions: acts })
  }

  const ms = props.multiSelect
  const stickOff = ms ? 26 : 0
  const commitEdit = () => {
    const ed = editing
    if (ed && props.onCellEdit) props.onCellEdit(ed.row, ed.idx, ed.key, editVal)
    setEditing(null)
  }
  const table = (
    <table ref={gridRef} className="g"
      tabIndex={(props.onRowClick || findable) ? 0 : undefined} onKeyDown={onKeyDown}
      style={{
        ...(props.mono ? { fontFamily: 'Consolas, monospace', fontSize: '10.5px' } : null),
        ...props.style,
      }}>
      <thead>
        <tr>
          {ms ? (
            <th className={props.stickyFirst ? 'stick' : undefined}
              style={{ width: 26, cursor: 'pointer', ...(props.stickyFirst ? { left: 0 } : null) }}
              title="전체 선택/해제" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" aria-label="전체 선택" checked={allShownSel}
                ref={(el) => { if (el) el.indeterminate = someShownSel && !allShownSel }}
                onChange={toggleAllShown} />
            </th>
          ) : null}
          {cols.map((c) => {
            const sortable = sortableOf(c)
            const active = sort?.key === c.key
            const w = colW[c.key] ?? c.width
            const stick = props.stickyFirst && c === cols[0]
            return (
              <th key={c.key}
                className={stick ? 'stick' : undefined}
                draggable={!!props.prefKey}
                onDragStart={() => { dragCol.current = c.key }}
                onDragOver={(e) => { if (props.prefKey && dragCol.current) e.preventDefault() }}
                onDrop={() => { const f = dragCol.current; dragCol.current = null; if (f && f !== c.key) reorderCol(f, c.key) }}
                style={{
                  position: stick ? 'sticky' : 'relative',
                  ...(w ? { width: w } : null),
                  ...(stick ? { left: stickOff, zIndex: 3 } : null),
                  ...(sortable ? { cursor: 'pointer', userSelect: 'none' } : null),
                }}
                aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                title={sortable ? '클릭 = 정렬 · 드래그 = 열 이동 · 우측 경계 = 너비' : (props.prefKey ? '드래그 = 열 이동' : undefined)}
                onClick={() => clickHeader(c)}>
                {c.header}
                {active ? <span style={{ fontSize: 9 }}> {sort!.dir === 'asc' ? '▲' : '▼'}</span> : null}
                {filterableOf(c) ? (
                  <span data-col-filter
                    title={colFilters[c.key]?.size ? '필터 적용됨 — 클릭하여 편집' : '컬럼 필터'}
                    style={{ cursor: 'pointer', marginLeft: 3, fontSize: 9, color: colFilters[c.key]?.size ? 'var(--accent, #2f6bd6)' : '#7A87A0' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (fltOpen?.key === c.key) { setFltOpen(null); return }
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setFltSearch('')
                      // 초안 = 현재 필터(있으면) 또는 전체 선택
                      setFltDraft(new Set(colFilters[c.key] ?? distinctValues(c)))
                      setFltOpen({ key: c.key, top: r.bottom + 2, left: Math.min(r.left, window.innerWidth - 222) })
                    }}>
                    {colFilters[c.key]?.size ? '▼' : '▽'}
                  </span>
                ) : null}
                {props.prefKey ? (
                  <span data-col-resize style={{
                    position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
                    cursor: 'col-resize', userSelect: 'none',
                  }}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.stopPropagation(); e.preventDefault()
                      const th = (e.currentTarget.parentElement as HTMLElement)
                      resizeRef.current = { key: c.key, startX: e.clientX, startW: w ?? th.offsetWidth }
                    }} />
                ) : null}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {pageRows.map(({ row, origIdx }, li) => {
          const i = pageStart + li   // shown 전역 인덱스(범위 선택·앵커용)
          const k = props.rowKey(row, origIdx)
          const checked = ms && isSel(k)
          return (
            <tr key={k} className={[props.selectedKey === k ? 'sel' : '', checked ? 'msel' : ''].filter(Boolean).join(' ') || undefined}
              onClick={() => props.onRowClick?.(row, origIdx)}
              onDoubleClick={() => props.onRowDoubleClick?.(row, origIdx)}>
              {ms ? (
                <td className={`c${props.stickyFirst ? ' stick' : ''}`} onClick={(e) => e.stopPropagation()}
                  style={props.stickyFirst ? { left: 0 } : undefined}>
                  <input type="checkbox" aria-label="행 선택" checked={!!checked} readOnly
                    onClick={(e) => {
                      if (e.shiftKey && anchorRef.current != null) selectRange(anchorRef.current, i)
                      else { toggleOne(k); anchorRef.current = i }
                    }} />
                </td>
              ) : null}
              {cols.map((c) => {
                const stick = props.stickyFirst && c === cols[0]
                const canEdit = c.editable && !!props.onCellEdit
                const isEditing = editing && editing.key === c.key && props.rowKey(editing.row, editing.idx) === k
                return (
                  <td key={c.key} className={[tdClass(c), stick ? 'stick' : ''].filter(Boolean).join(' ') || undefined}
                    style={stick ? { left: stickOff } : undefined}
                    onContextMenu={(e) => openCtx(e, row, origIdx, c)}
                    onDoubleClick={canEdit ? (e) => {
                      e.stopPropagation()
                      setEditVal(c.editValue ? c.editValue(row) : String(cellText(c, row, origIdx)))
                      setEditing({ row, idx: origIdx, key: c.key })
                    } : undefined}>
                    {isEditing ? (
                      <input className="in" data-cell-edit autoFocus value={editVal}
                        style={{ width: '100%', height: 18, fontSize: 10.5, padding: '0 2px' }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                          else if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
                        }} />
                    ) : c.render(row, origIdx)}
                  </td>
                )
              })}
            </tr>
          )
        })}
        {!pageRows.length && (props.loading || props.emptyText != null) ? (
          <tr data-grid-state>
            <td colSpan={cols.length + (ms ? 1 : 0)} style={{ textAlign: 'center', padding: '22px 10px', color: 'var(--txt-mute)' }}>
              {props.loading ? (
                <span data-grid-loading style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span className="dg-spin" style={{
                    width: 12, height: 12, border: '2px solid var(--line-strong)',
                    borderTopColor: 'var(--accent, #2f6bd6)', borderRadius: '50%', display: 'inline-block',
                  }} />
                  {typeof props.loading === 'string' ? props.loading : '불러오는 중…'}
                </span>
              ) : (
                <span data-grid-empty style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 18, opacity: 0.5 }}>📭</span>
                  <span style={{ fontSize: 11 }}>{props.emptyText}</span>
                </span>
              )}
            </td>
          </tr>
        ) : null}
      </tbody>
      {props.footer ? <tfoot><tr>{props.footer}</tr></tfoot> : null}
    </table>
  )

  const overlay = (findable || props.prefKey) ? (
    <span style={{ position: 'absolute', top: 2, right: 2, zIndex: 6, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      {findable ? (
        findOpen ? (
          <span className="gb" style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 3px', boxShadow: '0 2px 8px rgba(20,26,40,.2)' }}>
            <input ref={findInputRef} className="in" style={{ width: 120, height: 16, fontSize: 10.5 }}
              placeholder="찾기…" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeFind() }} />
            <span style={{ fontSize: 9.5, color: 'var(--txt-mute)', minWidth: 26, textAlign: 'right' }}>
              {q ? `${shown.length}/${view.length}` : ''}</span>
            <span className="b ic" style={{ fontSize: 11, opacity: 0.7, cursor: 'pointer' }} title="닫기 (Esc)"
              onClick={() => { setFindOpen(false); setQuery('') }}>✕</span>
          </span>
        ) : (
          <span className="b ic" title="찾기 (Ctrl+F)" style={{ fontSize: 11, opacity: 0.6, cursor: 'pointer' }}
            onClick={openFind}>🔍</span>
        )
      ) : null}
      {props.prefKey ? (
        <span ref={colRef} style={{ position: 'relative' }}>
          <span className="b ic" data-col-menu title="컬럼 표시 설정" style={{ fontSize: 11, opacity: 0.7, cursor: 'pointer' }}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenuPos({ top: r.bottom + 2, right: Math.max(4, window.innerWidth - r.right) })
              setColMenu((o) => !o)
            }}>⚙</span>
          {colMenu ? (
            // position:fixed — GroupBox(.gc overflow:auto) 클리핑 회피
            <div className="gb" style={{
              position: 'fixed', top: menuPos?.top ?? 0, right: menuPos?.right ?? 4, width: 180, zIndex: 1000,
              maxHeight: '70vh', boxShadow: '0 6px 20px rgba(20,26,40,.28)', textAlign: 'left',
            }}>
              <div className="gt" style={{ fontSize: 10 }}>컬럼 표시</div>
              <div className="gc p0" style={{ maxHeight: 260, overflow: 'auto', padding: 4 }}>
                {props.columns.map((c) => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '2px 4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                    {typeof c.header === 'string' ? c.header : c.key}
                  </label>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--line)', padding: 4, display: 'flex', gap: 4 }}>
                <span className="b" data-grid-csv style={{ fontSize: 10.5, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
                  onClick={() => { exportCsv(); setColMenu(false) }}>⬇ CSV</span>
                <span className="b" data-col-reset style={{ fontSize: 10.5, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
                  title="너비·순서 초기화"
                  onClick={() => { setColW({}); setColOrder([]); persistPref('gridColWidths', {}); persistPref('gridColOrder', []); setColMenu(false) }}>↺ 컬럼 초기화</span>
              </div>
            </div>
          ) : null}
        </span>
      ) : null}
    </span>
  ) : null

  const pager = pageCount > 1 ? (
    <div data-grid-pager style={{
      position: 'sticky', bottom: 0, zIndex: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
      padding: '2px 6px', borderTop: '1px solid var(--line)', background: '#EEF2F8',
      fontSize: 10.5, color: 'var(--txt-dim)',
    }}>
      <span>{(pageStart + 1).toLocaleString()}–{Math.min(pageStart + effPage, shown.length).toLocaleString()} / {shown.length.toLocaleString()}행</span>
      <span className="b ic" style={{ cursor: curPage > 0 ? 'pointer' : 'default', opacity: curPage > 0 ? 0.8 : 0.3 }}
        title="처음" onClick={() => curPage > 0 && setPage(0)}>«</span>
      <span className="b ic" style={{ cursor: curPage > 0 ? 'pointer' : 'default', opacity: curPage > 0 ? 0.8 : 0.3 }}
        title="이전" onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</span>
      <span style={{ minWidth: 54, textAlign: 'center' }}>{curPage + 1} / {pageCount}</span>
      <span className="b ic" style={{ cursor: curPage < pageCount - 1 ? 'pointer' : 'default', opacity: curPage < pageCount - 1 ? 0.8 : 0.3 }}
        title="다음" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>›</span>
      <span className="b ic" style={{ cursor: curPage < pageCount - 1 ? 'pointer' : 'default', opacity: curPage < pageCount - 1 ? 0.8 : 0.3 }}
        title="마지막" onClick={() => curPage < pageCount - 1 && setPage(pageCount - 1)}>»</span>
    </div>
  ) : null

  const ctxMenu = ctx ? (
    <div data-ctx-menu className="gb" style={{
      position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 1000, minWidth: 130,
      boxShadow: '0 6px 20px rgba(20,26,40,.28)', padding: 3,
    }} onMouseDown={(e) => e.stopPropagation()}>
      {ctx.actions.map((a, i) => (
        <div key={i} data-ctx-item className="b" style={{
          fontSize: 10.5, padding: '3px 8px', cursor: 'pointer', width: '100%',
          justifyContent: 'flex-start', color: a.danger ? 'var(--err)' : undefined,
        }} onClick={() => { a.onClick(); setCtx(null) }}>{a.label}</div>
      ))}
    </div>
  ) : null

  const fltCol = fltOpen ? props.columns.find((c) => c.key === fltOpen.key) : undefined
  const fltMenu = fltOpen && fltCol ? (() => {
    const all = distinctValues(fltCol)
    const shownVals = fltSearch.trim()
      ? all.filter((v) => v.toLowerCase().includes(fltSearch.trim().toLowerCase())) : all
    const apply = () => {
      setColFilters((prev) => {
        const next = { ...prev }
        // 전체 선택 = 필터 없음(제거), 부분 선택 = 필터 적용
        if (fltDraft.size === 0 || fltDraft.size === all.length) delete next[fltOpen.key]
        else next[fltOpen.key] = new Set(fltDraft)
        return next
      })
      setFltOpen(null)
    }
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onMouseDown={() => setFltOpen(null)} />
        <div data-col-filter-menu className="gb" style={{
          position: 'fixed', top: fltOpen.top, left: fltOpen.left, width: 210, zIndex: 1001,
          boxShadow: '0 6px 20px rgba(20,26,40,.28)', textAlign: 'left',
        }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="gt" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ flex: 1 }}>{typeof fltCol.header === 'string' ? fltCol.header : fltOpen.key} 필터</span>
            <span style={{ cursor: 'pointer', color: 'var(--txt-mute)' }} onClick={() => setFltDraft(new Set(all))}>전체</span>
            <span style={{ cursor: 'pointer', color: 'var(--txt-mute)' }} onClick={() => setFltDraft(new Set())}>해제</span>
          </div>
          <div style={{ padding: 4 }}>
            <input className="in" style={{ width: '100%', height: 18, fontSize: 10.5 }} placeholder="값 검색…"
              value={fltSearch} autoFocus onChange={(e) => setFltSearch(e.target.value)} />
          </div>
          <div className="gc p0" style={{ maxHeight: 220, overflow: 'auto', padding: '0 4px 4px' }}>
            {shownVals.map((v) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '2px 4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={fltDraft.has(v)}
                  onChange={() => setFltDraft((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n })} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </label>
            ))}
            {!shownVals.length ? <div style={{ fontSize: 10, color: 'var(--txt-mute)', padding: 4 }}>일치 값 없음</div> : null}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: 4, display: 'flex', gap: 4 }}>
            <span className="b" style={{ fontSize: 10.5, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
              onClick={() => setFltOpen(null)}>취소</span>
            <span className="b pri" data-col-filter-apply style={{ fontSize: 10.5, cursor: 'pointer', flex: 1, justifyContent: 'center' }}
              onClick={apply}>적용 ({fltDraft.size})</span>
          </div>
        </div>
      </>
    )
  })() : null

  if (!overlay && !pager && !props.rowActions && !fltMenu) return ctx ? <>{table}{ctxMenu}</> : table
  return (
    <div data-grid-wrap style={{ position: 'relative' }}>
      {overlay}
      {table}
      {pager}
      {ctxMenu}
      {fltMenu}
    </div>
  )
}
