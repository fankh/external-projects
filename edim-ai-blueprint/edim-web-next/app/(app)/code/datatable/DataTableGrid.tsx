'use client'

/** 데이터 Table — 행 선택 편집·추가·삭제·Excel 왕복 (N4b 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useFKeys } from '@/hooks/useFKeys'
import { addTableRow, deleteTableRow, importTableExcel, updateTableRow, type ActState } from './actions'

export interface TableRow { key: string; values: Record<string, string | number | null> }

const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/** 동적 컬럼 그리드 — columns(string[]) 로 GridColumn 을 런타임 생성. */
export function DataTableGrid({ name, columns, rows }: { name: string; columns: string[]; rows: TableRow[] }) {
  const router = useRouter()
  const [impSt, impAction, impPending] = useActionState(importTableExcel, {} as ActState)
  const [selKey, setSelKey] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.key === selKey) ?? null

  const cols: GridColumn<TableRow>[] = [
    { key: '__key', header: 'Key', width: 80, align: 'center', code: true, sortValue: (r) => r.key, render: (r) => r.key },
    ...columns.map((c) => ({
      key: c, header: c, align: 'right' as const,
      sortValue: (r: TableRow) => { const v = r.values[c]; return typeof v === 'number' ? v : (v ?? '') },
      render: (r: TableRow) => { const v = r.values[c]; return v == null || v === '' ? '—' : String(v) },
    })),
  ]

  const selectRow = (r: TableRow) => {
    setSelKey(r.key)
    setEdit(Object.fromEntries(columns.map((c) => [c, r.values[c] == null ? '' : String(r.values[c])])))
  }
  const editValues = (): Record<string, number | null> =>
    Object.fromEntries(columns.map((c) => [c, toNum(edit[c] ?? '')]))

  // N6 — F-key 수신: F12 저장(선택 행) · F3 삭제
  useFKeys({
    F12: () => { if (sel) start(async () => setSt(await updateTableRow(name, sel.key, editValues()))) },
    F3: () => {
      if (sel && confirm(`행 ${sel.key} 를 삭제하시겠습니까?`))
        start(async () => { setSt(await deleteTableRow(name, sel.key)); setSelKey(null) })
    },
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px 0', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>Table</label>
        <input className="in" defaultValue={name} style={{ height: 22, fontSize: 11, width: 110 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/code/datatable?name=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="hidden" name="name" value={name} />
          <input className="in" type="file" name="uploadedFile" accept=".xlsx" style={{ width: 180, fontSize: 10 }} />
          <button className="b" type="submit" disabled={impPending}>⬆ Import</button>
        </form>
        <button className="b" onClick={() => window.open(`/api/next/xlsx?kind=table&id=${encodeURIComponent(name)}`, '_blank')}>⬇ Export</button>
        <span className="sep" />
        <input className="in" style={{ width: 76 }} placeholder="새 Key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addTableRow(name, newKey, Object.fromEntries(columns.map((c) => [c, null])))
          setSt(r); if (r.ok) setNewKey('')
        })}>＋ 행 추가</button>
        {(impSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{impSt.error || st.error}</span> : null}
        {(impSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{impSt.ok || st.ok}</span> : null}
      </div>
      {sel ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 6px', flexWrap: 'wrap', fontSize: 11 }}>
          <b className="code">{sel.key}</b>
          {columns.map((c) => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ color: 'var(--txt-dim)' }}>{c}</span>
              <input className="in" style={{ width: 64, textAlign: 'right' }} value={edit[c] ?? ''}
                onChange={(e) => setEdit((cur) => ({ ...cur, [c]: e.target.value }))} />
            </label>
          ))}
          <button className="b run" disabled={pending} onClick={() => start(async () => setSt(await updateTableRow(name, sel.key, editValues())))}>저장 (F12)</button>
          <button className="b" disabled={pending} onClick={() => {
            if (confirm(`행 ${sel.key} 를 삭제하시겠습니까?`))
              start(async () => { setSt(await deleteTableRow(name, sel.key)); setSelKey(null) })
          }}>행 삭제</button>
        </div>
      ) : <div style={{ padding: '0 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>행 클릭 = 편집 패널 열기</div>}
      <div style={{ flex: 1, minHeight: 0, padding: '0 6px 6px' }}>
        <DenseGrid prefKey={`next-table-${name}`} colFilter columns={cols} rows={rows}
          rowKey={(r) => r.key} selectedKey={selKey ?? undefined}
          onRowClick={selectRow} emptyText="데이터 행이 없습니다" />
      </div>
    </div>
  )
}
