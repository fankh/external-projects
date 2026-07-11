/** 레거시 그리드 — 24px 행·양방향 실선·줄무늬·선택 옐로·합계 푸터 (디자인시안 .g).
 *  F8 — 헤더 클릭 정렬 (none→asc→desc 토글, ▲▼ 표시): 원본 인덱스를 보존해
 *  rowKey/onRowClick/selectedKey 가 정렬과 무관하게 동작한다 (index 기반 선택 화면 안전).
 *  정렬값: col.sortValue > render 원시값(string/number) — JSX 셀은 sortValue 미지정 시 정렬 제외. */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

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
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)

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

  return (
    <table className="g" style={{
      ...(props.mono ? { fontFamily: 'Consolas, monospace', fontSize: '10.5px' } : null),
      ...props.style,
    }}>
      <thead>
        <tr>
          {props.columns.map((c) => {
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
              {props.columns.map((c) => (
                <td key={c.key} className={tdClass(c)}>{c.render(row, origIdx)}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
      {props.footer ? <tfoot><tr>{props.footer}</tr></tfoot> : null}
    </table>
  )
}
