'use client'

/** U13 우측 공용 패널 3종 (Sub Work Place Templet, E-4) — Data Up-Load · Table · Coding.
 *  원본 PPT: 거의 모든 Set-up 화면 우측에 상시 배치 (슬라이드 4·7·8·38·45·66). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { evalPanelMacro, getRelChildren, getTableRows, importTableExcel, uploadPanelFile, type RelChild, type TableInfo, type TableRows } from './actions'

export interface MacroInfo { name: string; expr: string; status: string }

const DEPTS = ['Engineering', 'Sales', 'Manufacturing', 'Material', 'QC']
const TYPES = ['Table', 'Data', 'File', 'Image']

export function DataUploadPanel() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(uploadPanelFile, {})
  return (
    <GroupBox title="Data Up-Load" noPad>
      <form action={action} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4, alignItems: 'center', padding: 6, fontSize: 10.5 }}>
        <label>{t('panel.dept', '부서')}</label>
        <select name="dept" className="in" style={{ height: 19, fontSize: 10 }}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
        <label>{t('panel.type', '유형')}</label>
        <select name="dataType" className="in" style={{ height: 19, fontSize: 10 }}>{TYPES.map((d) => <option key={d}>{d}</option>)}</select>
        <label>{t('panel.name', '이름')}</label>
        <input name="name" className="in" style={{ height: 19, fontSize: 10 }} placeholder="KDCR 3-13" />
        <label>{t('panel.file', '파일')}</label>
        <input type="file" name="uploadedFile" className="in" style={{ fontSize: 9.5 }} />
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button type="submit" className="b" data-panel-upload disabled={pending} style={{ height: 19, fontSize: 10 }}>⬆ {t('panel.upload', '업로드')}</button>
          {st.error ? <span style={{ color: 'var(--err)', fontSize: 9.5 }}>{st.error}</span> : null}
          {st.ok ? <span style={{ color: 'var(--run)', fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.ok}</span> : null}
        </div>
      </form>
    </GroupBox>
  )
}

export function TablePanel({ tables }: { tables: TableInfo[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [sel, setSel] = useState(tables[0]?.name ?? '')
  const [preview, setPreview] = useState<TableRows | null>(null)
  const [pending, start] = useTransition()
  const load = (name: string) => {
    setSel(name)
    if (!name) { setPreview(null); return }
    start(async () => {
      const r = await getTableRows(name)
      setPreview(r.data ?? null)
    })
  }
  const info = tables.find((x) => x.name === sel)
  return (
    <GroupBox title="Table" noPad>
      <div style={{ padding: 6, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select className="in" data-panel-table value={sel} onChange={(e) => load(e.target.value)} style={{ height: 19, fontSize: 10, flex: 1 }}>
            {tables.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.rows})</option>)}
          </select>
          <button className="b" style={{ height: 19, fontSize: 9.5 }} onClick={() => router.push(`/code/datatable?name=${encodeURIComponent(sel)}`)}>{t('common.edit', '편집')}</button>
          <button className="b" style={{ height: 19, fontSize: 9.5 }} onClick={() => window.open(`/api/next/xlsx?kind=table&id=${encodeURIComponent(sel)}`, '_blank')}>⬇</button>
        </div>
        {info?.description ? <div style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{info.type} · {info.description}</div> : null}
        <button className="b" data-panel-preview disabled={!sel || pending} onClick={() => load(sel)} style={{ height: 19, fontSize: 10 }}>{pending ? '…' : t('panel.preview', '미리보기 (상위 4행)')}</button>
        <ImportRow tableName={sel} />
        {preview ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="g" style={{ fontSize: 9 }}>
              <thead><tr><th>Key</th>{preview.columns.slice(0, 5).map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.key}><td className="c code">{r.key}</td>
                  {preview.columns.slice(0, 5).map((c) => <td key={c} className="c">{String(r.values?.[c] ?? '')}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </div>
    </GroupBox>
  )
}

export function CodingPanel({ macros }: { macros: MacroInfo[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [sel, setSel] = useState(macros[0]?.name ?? '')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const cur = macros.find((m) => m.name === sel)
  const run = () => start(async () => {
    const r = await evalPanelMacro(cur?.expr ?? '')
    setResult(r.ok ? { ok: true, text: `= ${r.value}` } : { ok: false, text: r.error ?? '평가 실패' })
  })
  return (
    <GroupBox title="Coding" noPad>
      <div style={{ padding: 6, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select className="in" data-panel-macro value={sel} onChange={(e) => { setSel(e.target.value); setResult(null) }} style={{ height: 19, fontSize: 10, flex: 1 }}>
            {macros.map((m) => <option key={m.name} value={m.name}>{m.name} [{m.status}]</option>)}
          </select>
          <button className="b" style={{ height: 19, fontSize: 9.5 }} onClick={() => router.push('/toolbox/macros')}>Studio</button>
        </div>
        <div className="code" style={{ fontSize: 9.5, background: 'var(--panel, #F4F6FA)', padding: '3px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={cur?.expr ?? ''}>{cur?.expr || '—'}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="b run" data-panel-run disabled={!cur?.expr || pending} onClick={run} style={{ height: 19, fontSize: 10 }}>Run</button>
          {result ? <span data-panel-result style={{ fontSize: 10, fontWeight: 700, color: result.ok ? 'var(--run)' : 'var(--err)' }}>{result.text}</span> : null}
        </div>
      </div>
    </GroupBox>
  )
}

function ImportRow({ tableName }: { tableName: string }) {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(importTableExcel, {})
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="tableName" value={tableName} />
      <input type="file" name="excelFile" accept=".xlsx" className="in" style={{ fontSize: 9, flex: 1, minWidth: 110 }} aria-label="Excel" />
      <button type="submit" className="b" data-panel-import disabled={pending || !tableName} style={{ height: 19, fontSize: 9.5 }}
        title={t('panel.importHint', '정형 Excel Import — 1행 헤더(Key+열), Key 중복은 갱신 (E-4 Specification)')}>⬆ Excel</button>
      {st.error ? <span style={{ color: 'var(--err)', fontSize: 9 }}>{st.error}</span> : null}
      {st.ok ? <span data-panel-import-ok style={{ color: 'var(--run)', fontSize: 9 }}>{st.ok}</span> : null}
    </form>
  )
}

/** U26 — Child Component 패널 (슬라이드 69): mother 연결 Sub Code 표 + 코드 상세 딥링크. */
export function ChildPanel() {
  const { t } = useI18n()
  const router = useRouter()
  const [mother, setMother] = useState('KDCR 3-13')
  const [rows, setRows] = useState<RelChild[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const load = () => start(async () => {
    const r = await getRelChildren(mother)
    if (r === null) { setMsg(t('panel.childErr', '조회 실패 — Mother 코드 확인')); setRows(null) }
    else { setMsg(null); setRows(r) }
  })
  return (
    <GroupBox title="Child Component" noPad>
      <div style={{ padding: 6, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" data-panel-mother value={mother} aria-label="Mother" onChange={(e) => setMother(e.target.value)}
            style={{ height: 19, fontSize: 10, flex: 1 }} placeholder="Mother (KDCR 3-13)" />
          <button className="b" data-panel-child-load disabled={pending || !mother.trim()} onClick={load} style={{ height: 19, fontSize: 9.5 }}>{t('panel.query', '조회')}</button>
        </div>
        {msg ? <div style={{ color: 'var(--err)', fontSize: 9.5 }}>{msg}</div> : null}
        {rows ? (
          <div data-panel-children style={{ overflowX: 'auto', maxHeight: 130, overflowY: 'auto' }}>
            <table className="g" style={{ fontSize: 9 }}>
              <thead><tr><th>Child</th><th>Desc.</th><th>Q&apos;ty</th><th>Data</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.code}>
                  <td className="c code">{r.code}</td>
                  <td className="c" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.desc}</td>
                  <td className="c" style={{ textAlign: 'right' }}>{r.qty}</td>
                  <td className="c" style={{ textAlign: 'center', cursor: 'pointer' }}
                    title={t('panel.childDetail', '코드 상세 (Tech·Variant·도면)')}
                    onClick={() => router.push(`/detail/code?code=${encodeURIComponent(r.code)}`)}>📄</td>
                </tr>
              ))}</tbody>
            </table>
            {!rows.length ? <div style={{ padding: 4, color: 'var(--txt-mute)', fontSize: 9.5 }}>{t('panel.noChildren', 'Child 없음')}</div> : null}
          </div>
        ) : null}
      </div>
    </GroupBox>
  )
}
