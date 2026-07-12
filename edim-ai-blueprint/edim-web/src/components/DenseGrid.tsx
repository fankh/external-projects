/** 레거시 그리드 — 24px 행·양방향 실선·줄무늬·선택 옐로·합계 푸터 (디자인시안 .g).
 *  F8 — 헤더 클릭 정렬 (none→asc→desc 토글, ▲▼ 표시): 원본 인덱스를 보존해
 *  rowKey/onRowClick/selectedKey 가 정렬과 무관하게 동작한다 (index 기반 선택 화면 안전).
 *  정렬값: col.sortValue > render 원시값(string/number) — JSX 셀은 sortValue 미지정 시 정렬 제외. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { prefService } from '../api/services'

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

export function DenseGrid<T>(props: {
  columns: GridColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  selectedKey?: string | number | null
  onRowClick?: (row: T, index: number) => void
  onRowDoubleClick?: (row: T, index: number) => void
  footer?: ReactNode        // <tr> 내용
  mono?: boolean
  style?: CSSProperties
  /** D8 — 지정 시 컬럼 표시/숨김 ⚙ 토글 + 서버 영속(prefs gridColumns[prefKey]) */
  prefKey?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)
  // D8 — 컬럼 표시 설정
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [colMenu, setColMenu] = useState(false)
  const colRef = useRef<HTMLSpanElement>(null)
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
    if (!props.onRowClick || view.length === 0) return
    const cur = view.findIndex(({ row, origIdx }) => props.rowKey(row, origIdx) === props.selectedKey)
    const next = Math.max(0, Math.min(view.length - 1, (cur < 0 ? 0 : cur + delta)))
    props.onRowClick(view[next].row, view[next].origIdx)
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!props.onRowClick) return
    const k = e.key
    if (k === 'ArrowDown') { e.preventDefault(); navigate(1) }
    else if (k === 'ArrowUp') { e.preventDefault(); navigate(-1) }
    else if (k === 'Home') { e.preventDefault(); navigate(-1e9) }
    else if (k === 'End') { e.preventDefault(); navigate(1e9) }
    else if (k === 'PageDown') { e.preventDefault(); navigate(10) }
    else if (k === 'PageUp') { e.preventDefault(); navigate(-10) }
    else if (k === 'Enter' && props.onRowDoubleClick) {
      const cur = view.find(({ row, origIdx }) => props.rowKey(row, origIdx) === props.selectedKey)
      if (cur) { e.preventDefault(); props.onRowDoubleClick(cur.row, cur.origIdx) }
    }
  }
  useEffect(() => {
    gridRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' })
  }, [props.selectedKey])

  const table = (
    <table ref={gridRef} className="g"
      tabIndex={props.onRowClick ? 0 : undefined} onKeyDown={onKeyDown}
      style={{
        ...(props.mono ? { fontFamily: 'Consolas, monospace', fontSize: '10.5px' } : null),
        ...props.style,
      }}>
      <thead>
        <tr>
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
        {view.map(({ row, origIdx }) => {
          const k = props.rowKey(row, origIdx)
          return (
            <tr key={k} className={props.selectedKey === k ? 'sel' : undefined}
              onClick={() => props.onRowClick?.(row, origIdx)}
              onDoubleClick={() => props.onRowDoubleClick?.(row, origIdx)}>
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

  if (!props.prefKey) return table
  // D8 — 컬럼 표시 설정 ⚙ (우상단 오버레이)
  return (
    <div style={{ position: 'relative' }}>
      <span ref={colRef} style={{ position: 'absolute', top: 2, right: 2, zIndex: 5 }}>
        <span className="b ic" data-col-menu title="컬럼 표시 설정"
          style={{ fontSize: 11, opacity: 0.7 }}
          onClick={() => setColMenu((o) => !o)}>⚙</span>
        {colMenu ? (
          <div className="gb" style={{
            position: 'absolute', right: 0, top: 20, width: 180, zIndex: 100,
            boxShadow: '0 6px 20px rgba(20,26,40,.28)', textAlign: 'left',
          }}>
            <div className="gt" style={{ fontSize: 10 }}>컬럼 표시</div>
            <div className="gc p0" style={{ maxHeight: 260, overflow: 'auto', padding: 4 }}>
              {props.columns.map((c) => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '2px 4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!hidden.has(c.key)}
                    onChange={() => toggleCol(c.key)} />
                  {typeof c.header === 'string' ? c.header : c.key}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </span>
      {table}
    </div>
  )
}
