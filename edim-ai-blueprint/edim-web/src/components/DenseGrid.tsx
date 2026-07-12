/** 레거시 그리드 — 24px 행·양방향 실선·줄무늬·선택 옐로·합계 푸터 (디자인시안 .g).
 *  F8 — 헤더 클릭 정렬 (none→asc→desc 토글, ▲▼ 표시): 원본 인덱스를 보존해
 *  rowKey/onRowClick/selectedKey 가 정렬과 무관하게 동작한다 (index 기반 선택 화면 안전).
 *  정렬값: col.sortValue > render 원시값(string/number) — JSX 셀은 sortValue 미지정 시 정렬 제외.
 *  G2 — 그리드 내 찾기(Ctrl+F, 보이는 셀 텍스트 부분일치 필터) · 공용 다중행 선택(multiSelect: 체크박스 열·Shift 범위·전체선택). */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { prefService } from '../api/services'
import { downloadCsv } from '../utils/csv'

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
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)
  // D8 — 컬럼 표시 설정
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [colMenu, setColMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const colRef = useRef<HTMLSpanElement>(null)
  // G2 — 그리드 내 찾기
  const findable = props.findable !== false
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)   // G2 — 페이지네이션(0-based)
  const findInputRef = useRef<HTMLInputElement>(null)
  // G2 — 다중 선택 Shift 범위 앵커(shown 인덱스)
  const anchorRef = useRef<number | null>(null)

  useEffect(() => {
    if (!props.prefKey) return
    void prefService.get<Record<string, string[]>>('gridColumns').then((m) => {
      const h = m && m[props.prefKey!]
      if (Array.isArray(h)) setHidden(new Set(h))
    })
  }, [props.prefKey])
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
  const cols = props.prefKey ? props.columns.filter((c) => !hidden.has(c.key)) : props.columns

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

  // G2 — 찾기 필터(보이는 컬럼 텍스트 부분일치)
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    if (!q) return view
    return view.filter(({ row, origIdx }) =>
      cols.some((c) => String(cellText(c, row, origIdx)).toLowerCase().includes(q)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, q, cols])

  // G2 — 페이지네이션: 150행 초과 시 자동 100행/페이지 (소규모 그리드는 단일 페이지=기존 동작)
  const effPage = props.pageSize ?? (shown.length > 150 ? 100 : (shown.length || 1))
  const pageCount = Math.max(1, Math.ceil(shown.length / effPage))
  const curPage = Math.min(page, pageCount - 1)
  const pageStart = curPage * effPage
  const pageRows = shown.slice(pageStart, pageStart + effPage)
  useEffect(() => { setPage(0) }, [q])

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

  const ms = props.multiSelect
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
            <th style={{ width: 26, cursor: 'pointer' }} title="전체 선택/해제" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" aria-label="전체 선택" checked={allShownSel}
                ref={(el) => { if (el) el.indeterminate = someShownSel && !allShownSel }}
                onChange={toggleAllShown} />
            </th>
          ) : null}
          {cols.map((c) => {
            const sortable = sortableOf(c)
            const active = sort?.key === c.key
            return (
              <th key={c.key}
                style={{
                  ...(c.width ? { width: c.width } : null),
                  ...(sortable ? { cursor: 'pointer', userSelect: 'none' } : null),
                }}
                aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                title={sortable ? '클릭 = 정렬 (▲→▼→해제)' : undefined}
                onClick={() => clickHeader(c)}>
                {c.header}
                {active ? <span style={{ fontSize: 9 }}> {sort!.dir === 'asc' ? '▲' : '▼'}</span> : null}
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
                <td className="c" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label="행 선택" checked={!!checked} readOnly
                    onClick={(e) => {
                      if (e.shiftKey && anchorRef.current != null) selectRange(anchorRef.current, i)
                      else { toggleOne(k); anchorRef.current = i }
                    }} />
                </td>
              ) : null}
              {cols.map((c) => (
                <td key={c.key} className={tdClass(c)}>{c.render(row, origIdx)}</td>
              ))}
            </tr>
          )
        })}
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
              <div style={{ borderTop: '1px solid var(--line)', padding: 4 }}>
                <span className="b" data-grid-csv style={{ fontSize: 10.5, cursor: 'pointer', width: '100%', justifyContent: 'center' }}
                  onClick={() => { exportCsv(); setColMenu(false) }}>⬇ CSV 내보내기</span>
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

  if (!overlay && !pager) return table
  return (
    <div data-grid-wrap style={{ position: 'relative' }}>
      {overlay}
      {table}
      {pager}
    </div>
  )
}
