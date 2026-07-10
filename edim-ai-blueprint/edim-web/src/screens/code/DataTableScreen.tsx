/** M-3-7 데이터 Table 관리 (W-20, 슬라이드 66·46) — Excel 문법 인라인 편집 ·
 *  Hierarchy 주소 = Macro 참조 경로 · row_key_num 범위 조회 안내. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { TABLE12, TABLE12_ROWS, type TableRow } from '../../api/mock/dataCode'
import { tableCrudService } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function DataTableScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<TableRow[]>([])
  const [selKey, setSelKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; col: number } | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = dirtyKeys.size

  const load = async (): Promise<TableRow[]> => {
    const data = await tableCrudService.get(TABLE12.name)
    const next = data
      ? data.rows.map((r) => ({
        key: r.key,
        cols: TABLE12.columns.map((c) => r.values[c] ?? null),
        remarks: '',
      }))
      : TABLE12_ROWS   // mock 폴백
    setRows(next)
    setDirtyKeys(new Set())
    return next
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rowValues = (r: TableRow): Record<string, number | null> =>
    Object.fromEntries(TABLE12.columns.map((c, i) => [c, r.cols[i]]))

  const save = () => {
    void (async () => {
      try {
        for (const key of dirtyKeys) {
          const r = rows.find((x) => x.key === key)
          if (r && !await tableCrudService.updateRow(TABLE12.name, key, rowValues(r))) {
            shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{BACKEND_REQUIRED}</span>)
            return   // dirty 유지 — 백엔드 복구 후 F12 재시도
          }
        }
        setDirtyKeys(new Set())
        shell.setStatusMsg(`Table12 저장 ${dirtyKeys.size}행 (tbl_data_row) — 참조 Macro 4건 영향 검토 대상`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          저장 실패 — {e instanceof Error ? e.message : String(e)}</span>)
      }
    })()
  }

  const addBusy = useRef(false)   // 키 반복(F2 연타/홀드) 동시 실행 가드

  const maxKey = (rs: TableRow[]) => Math.max(0, ...rs.map((r) => Number(r.key) || 0))
  const BACKEND_REQUIRED = '백엔드 연결 필요 — Table 편집은 실DB 에만 기록됩니다 (MOCK 모드 편집 불가)'

  const addRow = () => {
    if (addBusy.current) return
    addBusy.current = true
    void (async () => {
      try {
        let nextKey = String(maxKey(rows) + 90)
        try {
          if (!await tableCrudService.addRow(TABLE12.name, nextKey, {})) {
            shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{BACKEND_REQUIRED}</span>)
            return
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('중복')) {
            // 다른 세션이 추가한 행으로 로컬이 뒤처짐 — 서버 실데이터로 재동기 후 1회 재시도
            const fresh = await tableCrudService.get(TABLE12.name)
            if (!fresh) {
              shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{BACKEND_REQUIRED}</span>)
              return
            }
            const freshRows: TableRow[] = fresh.rows.map((r) => ({
              key: r.key,
              cols: TABLE12.columns.map((c) => r.values[c] ?? null),
              remarks: '',
            }))
            setRows(freshRows)
            setDirtyKeys(new Set())
            nextKey = String(maxKey(freshRows) + 90)
            if (!await tableCrudService.addRow(TABLE12.name, nextKey, {})) {
              shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{BACKEND_REQUIRED}</span>)
              return
            }
            setRows((prev) => [...prev, { key: nextKey, cols: TABLE12.columns.map(() => null), remarks: '' }])
            setSelKey(nextKey)
            shell.setStatusMsg(`행 추가 — Key ${nextKey} (서버 재동기 후 발번)`)
            return
          }
          throw e
        }
        setRows((prev) => [...prev, { key: nextKey, cols: TABLE12.columns.map(() => null), remarks: '' }])
        setSelKey(nextKey)
        shell.setStatusMsg(`행 추가 — Key ${nextKey} (row_key_num 자동 파싱)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          행 추가 실패 — {e instanceof Error ? e.message : String(e)}</span>)
      } finally {
        addBusy.current = false
      }
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
      try {
        if (!await tableCrudService.deleteRow(TABLE12.name, key)) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{BACKEND_REQUIRED}</span>)
          return
        }
        // 삭제 후 이웃 행으로 포커스 이동 — 마지막 행이면 바로 위 행 (연속 F3 편집 흐름)
        const idx = rows.findIndex((r) => r.key === key)
        const remaining = rows.filter((r) => r.key !== key)
        const neighbor = remaining[Math.min(idx, remaining.length - 1)] ?? null
        setRows(remaining)
        setDirtyKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
        setSelKey(neighbor?.key ?? null)
        shell.setStatusMsg(`행 삭제 — Key ${key}`
          + (neighbor ? ` · 선택 → ${neighbor.key}` : '') + ' (참조 Macro 영향 검토 대상)')
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          행 삭제 실패 — {e instanceof Error ? e.message : String(e)}</span>)
      }
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
          <GroupBox title={t('dtable.tableDef', 'Table 정의')}>
            <div className="frm">
              <label>Name</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="in ro" value={TABLE12.name} readOnly aria-label="Table Name" />
                <Btn onClick={() => shell.setStatusMsg('중복 없음 ✓ — Table12')}>
                  {t('subcode.dupCheck', '중복검토')}
                </Btn>
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
            <Btn onClick={addRow}>{t('dtable.addRowF2', '＋ 행 추가 F2')}</Btn>
            <Btn>✎ {t('common.edit', '편집')}</Btn>
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
              {t('dtable.keyHint', 'Key 숫자면 row_key_num 자동 파싱 — 범위 조회(10:25) 정렬 보장')}
            </span>
            {dirty > 0
              ? <Chip tone="warn">{t('dtable.unsaved', '변경 {n}건 미저장').replace('{n}', String(dirty))}</Chip>
              : null}
            <Btn variant="pri" onClick={save}>{t('subcode.saveF12', '저장 F12')}</Btn>
          </div>
          <GroupBox title={t('dtable.gridTitle', 'Table12 — 셀 더블클릭 = 편집 (Excel 문법)')} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.key}
              selectedKey={selKey} onRowClick={(r) => setSelKey(r.key)} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('dtable.addressTitle', 'Table Address — Hierarchy = DB 주소')}>
            <Fx>{TABLE12.address}</Fx>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 3 }}>
              {t('dtable.macroRefHint', 'Macro 가 이 경로로 참조:')} <code style={{ fontSize: 10 }}>Table12(E,10:25,Cos2)</code>
            </div>
          </GroupBox>
          <GroupBox title={t('dtable.refMacroTitle', '참조 Macro — 영향도 4건')} noPad>
            <table className="g">
              <thead><tr><th>Macro</th><th>{t('dtable.usage', '사용식')}</th><th>{t('dtable.screen', '화면')}</th></tr></thead>
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
          <GroupBox title={t('dtable.importRules', 'Import 규칙')}>
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              · {t('dtable.importRule1', '정형 양식(1행 헤더 = 열 이름) Excel 만 허용')}<br />
              · {t('dtable.importRule2', 'Key 중복 행은 거부 — 오류 리포트 다운로드')}<br />
              · {t('dtable.importRule3', '수치 열 텍스트 혼입 시 해당 셀 무시(경고)')}
            </div>
          </GroupBox>
          <GroupBox title={t('dtable.apprStatus', '승인 상태')}>
            <Chip tone="ok">Approved</Chip>
            <span style={{ fontSize: 10, color: 'var(--txt-mute)', marginLeft: 6 }}>
              {t('dtable.reapprovalHint', '변경 저장 시 재승인 대상 (Grade 정책)')}
            </span>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
