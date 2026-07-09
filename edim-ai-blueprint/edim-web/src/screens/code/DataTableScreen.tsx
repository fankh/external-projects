/** M-3-7 데이터 Table 관리 (W-20, 슬라이드 66·46) — Excel 문법 인라인 편집 ·
 *  Hierarchy 주소 = Macro 참조 경로 · row_key_num 범위 조회 안내. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { TABLE12, TABLE12_ROWS, type TableRow } from '../../api/mock/dataCode'
import { tableCrudService } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function DataTableScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [rows, setRows] = useState<TableRow[]>([])
  const [selKey, setSelKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; col: number } | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = dirtyKeys.size

  const load = async () => {
    const data = await tableCrudService.get(TABLE12.name)
    if (data) {
      setRows(data.rows.map((r) => ({
        key: r.key,
        cols: TABLE12.columns.map((c) => r.values[c] ?? null),
        remarks: '',
      })))
    } else {
      setRows(TABLE12_ROWS)   // mock 폴백
    }
    setDirtyKeys(new Set())
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rowValues = (r: TableRow): Record<string, number | null> =>
    Object.fromEntries(TABLE12.columns.map((c, i) => [c, r.cols[i]]))

  const save = () => {
    void (async () => {
      for (const key of dirtyKeys) {
        const r = rows.find((x) => x.key === key)
        if (r) await tableCrudService.updateRow(TABLE12.name, key, rowValues(r))
      }
      setDirtyKeys(new Set())
      shell.setStatusMsg(`Table12 저장 ${dirtyKeys.size}행 (tbl_data_row) — 참조 Macro 4건 영향 검토 대상`)
    })()
  }

  const addRow = () => {
    const nextKey = String(Math.max(0, ...rows.map((r) => Number(r.key) || 0)) + 90)
    void (async () => {
      await tableCrudService.addRow(TABLE12.name, nextKey, {})
      setRows((prev) => [...prev, { key: nextKey, cols: TABLE12.columns.map(() => null), remarks: '' }])
      setSelKey(nextKey)
      shell.setStatusMsg(`행 추가 — Key ${nextKey} (row_key_num 자동 파싱)`)
    })()
  }

  const importExcel = (f: globalThis.File) => {
    void (async () => {
      try {
        const report = await tableCrudService.importExcel(TABLE12.name, f)
        if (report) {
          await load()
          shell.setStatusMsg(`Excel Import — 신규 ${report.inserted} · 갱신 ${report.updated}`
            + (report.rejected.length ? ` · 거부 ${report.rejected.length} (${report.rejected[0]} …)` : ''))
        } else {
          shell.setStatusMsg('Excel Import — 백엔드 불가 (mock 모드)')
        }
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : 'Import 실패'}</span>)
      }
    })()
  }

  const deleteRow = () => {
    if (!selKey) {
      shell.setStatusMsg('F3 삭제 — 삭제할 행을 먼저 선택하십시오')
      return
    }
    const key = selKey
    void (async () => {
      await tableCrudService.deleteRow(TABLE12.name, key)
      // 삭제 후 이웃 행으로 포커스 이동 — 마지막 행이면 바로 위 행 (연속 F3 편집 흐름)
      const idx = rows.findIndex((r) => r.key === key)
      const remaining = rows.filter((r) => r.key !== key)
      const neighbor = remaining[Math.min(idx, remaining.length - 1)] ?? null
      setRows(remaining)
      setDirtyKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
      setSelKey(neighbor?.key ?? null)
      shell.setStatusMsg(`행 삭제 — Key ${key}`
        + (neighbor ? ` · 선택 → ${neighbor.key}` : '') + ' (참조 Macro 영향 검토 대상)')
    })()
  }

  useFKeys(active, useMemo(() => ({ F2: addRow, F3: deleteRow, F12: save }), [rows, selKey])) // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (key: string, col: number, v: string) => {
    setRows((prev) => prev.map((r) => (r.key === key
      ? { ...r, cols: r.cols.map((c, i) => (i === col ? (v.trim() === '' ? null : Number(v)) : c)) }
      : r)))
    setEditing(null)
    setDirtyKeys((prev) => new Set(prev).add(key))
  }

  const cols: GridColumn<TableRow>[] = [
    { key: 'k', header: 'Key No', width: 60, code: true, render: (r) => r.key },
    ...TABLE12.columns.map((name, ci) => ({
      key: name, header: name, width: 72, align: 'right' as const,
      render: (r: TableRow) => (
        editing && editing.key === r.key && editing.col === ci
          ? (
            <input autoFocus className="in" style={{ width: '100%', height: 20, textAlign: 'right' }}
              defaultValue={r.cols[ci] ?? ''} aria-label={`${r.key}-${name}`}
              onBlur={(e) => setCell(r.key, ci, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          )
          : (
            <span style={{ display: 'block', minHeight: 14 }}
              onDoubleClick={() => setEditing({ key: r.key, col: ci })}>
              {r.cols[ci] ?? ''}
            </span>
          )
      ),
    })),
    { key: 'rem', header: 'Remarks', render: (r) => r.remarks },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title="Table 정의">
            <div className="frm">
              <label>Name</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="in ro" value={TABLE12.name} readOnly aria-label="Table Name" />
                <Btn onClick={() => shell.setStatusMsg('중복 없음 ✓ — Table12')}>중복검토</Btn>
              </div>
              <label>Table Type</label>
              <Combo value={TABLE12.type} options={['Variant', 'Tech', 'Constant']} />
              <label>Department</label>
              <Combo value={TABLE12.department} options={['Engineering', 'Sales', 'Purchasing']} />
              <label>Row / Column</label>
              <input className="in" defaultValue={TABLE12.rowDef} aria-label="Row Column" />
            </div>
          </GroupBox>
          <div className="toolbar" style={{ border: '1px solid var(--line)' }}>
            <Btn onClick={addRow}>＋ 행 추가 F2</Btn>
            <Btn>✎ 편집</Btn>
            <input ref={fileInput} type="file" accept=".xlsx" style={{ display: 'none' }}
              aria-label="Excel 파일"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importExcel(f)
                e.target.value = ''
              }} />
            <Btn onClick={() => fileInput.current?.click()}>⬇ Excel Import</Btn>
            <Btn>⬆ Export</Btn>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>
              Key 숫자면 row_key_num 자동 파싱 — 범위 조회(10:25) 정렬 보장
            </span>
            {dirty > 0 ? <Chip tone="warn">변경 {dirty}건 미저장</Chip> : null}
            <Btn variant="pri" onClick={save}>저장 F12</Btn>
          </div>
          <GroupBox title="Table12 — 셀 더블클릭 = 편집 (Excel 문법)" noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.key}
              selectedKey={selKey} onRowClick={(r) => setSelKey(r.key)} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="Table Address — Hierarchy = DB 주소">
            <Fx>{TABLE12.address}</Fx>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 3 }}>
              Macro 가 이 경로로 참조: <code style={{ fontSize: 10 }}>Table12(E,10:25,Cos2)</code>
            </div>
          </GroupBox>
          <GroupBox title="참조 Macro — 영향도 4건" noPad>
            <table className="g">
              <thead><tr><th>Macro</th><th>사용식</th><th>화면</th></tr></thead>
              <tbody>
                {TABLE12.refMacros.map((m) => (
                  <tr key={m.macro}>
                    <td className="code">{m.macro}</td>
                    <td className="code">{m.usage}</td>
                    <td>{m.screen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="Import 규칙">
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              · 정형 양식(1행 헤더 = 열 이름) Excel 만 허용<br />
              · Key 중복 행은 거부 — 오류 리포트 다운로드<br />
              · 수치 열 텍스트 혼입 시 해당 셀 무시(경고)
            </div>
          </GroupBox>
          <GroupBox title="승인 상태">
            <Chip tone="ok">Approved</Chip>
            <span style={{ fontSize: 10, color: 'var(--txt-mute)', marginLeft: 6 }}>
              변경 저장 시 재승인 대상 (Grade 정책)
            </span>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
