/** 레거시 그리드 — 24px 행·양방향 실선·줄무늬·선택 옐로·합계 푸터 (디자인시안 .g). */
import type { CSSProperties, ReactNode } from 'react'

export interface GridColumn<T> {
  key: string
  header: ReactNode
  width?: number
  align?: 'left' | 'center' | 'right'
  code?: boolean
  render: (row: T, index: number) => ReactNode
}

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
  const tdClass = (c: GridColumn<T>) => {
    const cls: string[] = []
    if (c.align === 'center') cls.push('c')
    if (c.align === 'right') cls.push('num')
    if (c.code) cls.push('code')
    return cls.join(' ') || undefined
  }
  return (
    <table className="g" style={{
      ...(props.mono ? { fontFamily: 'Consolas, monospace', fontSize: '10.5px' } : null),
      ...props.style,
    }}>
      <thead>
        <tr>
          {props.columns.map((c) => (
            <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, i) => {
          const k = props.rowKey(row, i)
          return (
            <tr key={k} className={props.selectedKey === k ? 'sel' : undefined}
              onClick={() => props.onRowClick?.(row, i)}
              onDoubleClick={() => props.onRowDoubleClick?.(row, i)}>
              {props.columns.map((c) => (
                <td key={c.key} className={tdClass(c)}>{c.render(row, i)}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
      {props.footer ? <tfoot><tr>{props.footer}</tr></tfoot> : null}
    </table>
  )
}
