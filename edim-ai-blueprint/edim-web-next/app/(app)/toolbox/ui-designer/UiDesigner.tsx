'use client'

import { useRef, useState } from 'react'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { useEditHistory } from '@/hooks/useEditHistory'
import { saveLayout, publishForm, aiSuggest, bindOptions, type Widget } from './actions'

const FORM_NAME = 'CPQ-Selection'
// U16 — 액션 동작(슬라이드 27 Commend button set-up macro) · 바인딩 화이트리스트
const ACTION_OPS = ['저장', '삭제', '복사', '등록', '찾기', '하이퍼링크', '프로그램 실행', '매크로']
const BIND_TABLES: Record<string, string[]> = {
  prt_part: ['part_no', 'part_name', 'unit'],
  cst_quotation: ['quotation_no', 'status', 'currency'],
}
const WIDGET_PALETTE = [
  { group: 'Layouts', items: ['Vertical', 'Horizontal', 'Grid', 'Form'] },
  { group: 'Buttons', items: ['Push', 'Radio', 'Check'] },
  { group: 'Input', items: ['Combo', 'Line Edit', 'Text', 'Date'] },
  { group: 'Views', items: ['Table', 'Tree', 'List'] },
  { group: 'Containers', items: ['Frame', 'Canvas', 'Group Box'] },
]

export function UiDesigner({ initialWidgets, initialVersion }: { initialWidgets: Widget[]; initialVersion: number }) {
  const { t } = useI18n()
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets)
  const [selId, setSelId] = useState<string | null>(initialWidgets[0]?.id ?? null)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(initialVersion)
  const [aiText, setAiText] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const seq = useRef(initialWidgets.length + 5)
  const say = (text: string, err = false) => setStatus({ text, err })
  const sel = widgets.find((w) => w.id === selId) ?? null
  // U16 — 위젯 Set-up 다이얼로그 (동작·대상·Data + Combo 바인딩)
  const [setupOpen, setSetupOpen] = useState(false)
  const [dlg, setDlg] = useState({ op: '', target: '', data: '', table: '', column: '' })
  const [dlgVals, setDlgVals] = useState<string[] | null>(null)
  const [bindPreview, setBindPreview] = useState<Record<string, string[]>>({})
  const openSetup = (w0?: Widget) => {
    const w = w0 ?? sel
    if (!w) return
    if (w0) setSelId(w0.id)
    setDlg({ op: w.action?.op ?? '', target: w.action?.target ?? '', data: w.action?.data ?? '', table: w.bind?.table ?? '', column: w.bind?.column ?? '' })
    setDlgVals(null); setSetupOpen(true)
  }
  const testBind = () => void (async () => {
    if (!dlg.table || !dlg.column) return
    const vals = await bindOptions(dlg.table, dlg.column)
    setDlgVals(vals ?? [])
    say(vals === null ? '바인딩 조회 불가 — 백엔드 연결 필요' : `바인딩 조회 ✓ — ${dlg.table}.${dlg.column} ${vals.length}건`, vals === null)
  })()
  const saveSetup = () => {
    hist.push()
    setWidgets((prev) => prev.map((w) => w.id !== selId ? w : ({
      ...w,
      action: dlg.op ? { op: dlg.op, target: dlg.target, data: dlg.data } : undefined,
      bind: dlg.table && dlg.column ? { table: dlg.table, column: dlg.column } : undefined,
    })))
    setDirty(true); setSetupOpen(false)
    say('위젯 Set-up 반영 — 저장 F12 로 layout_def 영속 (TBX-002, 슬라이드 27)')
  }
  const openPreview = () => {
    setShowPreview(true)
    widgets.filter((w) => w.kind === 'Combo' && w.bind).forEach((w) => {
      void bindOptions(w.bind!.table, w.bind!.column).then((vals) => { if (vals) setBindPreview((p) => ({ ...p, [w.id]: vals })) })
    })
  }

  const hist = useEditHistory(true, widgets, setWidgets, (kind) => { setDirty(true); say(`${kind === 'undo' ? '실행 취소' : '다시 실행'} — 위젯 배치 이력`) })

  const doSave = async (): Promise<boolean> => {
    const r = await saveLayout(FORM_NAME, widgets)
    if (r) { setDirty(false); setVersion(r.version); say(`레이아웃 저장 ✓ — tbx_ui_form v${r.version} (layout_def JSONB)`); return true }
    say('저장 불가 — 백엔드 연결 필요', true); return false
  }
  const addWidget = (kind: string) => {
    hist.push()
    const id = `w${seq.current++}`
    setWidgets((prev) => [...prev, { id, kind, label: kind, x: 30 + (prev.length % 4) * 80, y: 260 - (prev.length % 3) * 40, w: 96, h: 24 }])
    setSelId(id); setDirty(true); say(`위젯 배치 — ${kind} (동작은 Set-up Templet 에서 연결, TBX-002)`)
  }
  const publish = () => void (async () => {
    if (!await doSave()) return
    const ok = await publishForm(FORM_NAME, version + 1)
    say(ok ? '게시 승인 요청 ✓ — 승인함(M-15-2) 등록 · 승인 후 게시 (TBX-004)' : '승인 요청 불가', !ok)
  })()
  const runAi = () => {
    if (!aiText.trim()) return
    void (async () => {
      const r = await aiSuggest(aiText)
      if (r === null) { addWidget('Form'); say('AI 초안 (mock) — 백엔드 불가'); return }
      const base = seq.current
      setWidgets((prev) => [...prev, ...r.widgets.map((w, i) => ({ id: `ai${base + i}`, kind: w.kind, label: w.label, x: w.x, y: w.y, w: w.w, h: w.h }))])
      seq.current += r.widgets.length; setDirty(true)
      say(r.mode === 'live' ? `AI 초안 ✓ (Claude) — 위젯 ${r.widgets.length}개: ${r.notes.slice(0, 60)}` : `AI 초안 (${r.mode === 'sample' ? '샘플 모드 — API 키 미설정' : `오류: ${r.error}`}) — 위젯 ${r.widgets.length}개`)
    })()
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband">
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>Form — CPQ / Selection v{version} {dirty ? '*' : ''}</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={openPreview}>{t('common.preview', '미리보기')}</Btn>
        <span className="b ic" title={t('common.undo', '실행 취소')} onClick={() => window.dispatchEvent(new CustomEvent('edim-undo'))}>↶</span>
        <span className="b ic" title={t('common.redo', '다시 실행')} onClick={() => window.dispatchEvent(new CustomEvent('edim-redo'))}>↷</span>
        <Btn onClick={() => { void doSave() }}>{t('uidsn.saveF12', '저장 F12')}</Btn>
        <Btn variant="pri" onClick={publish}>{t('uidsn.publish', '게시 (승인 후)')}</Btn>
      </div>
      {showPreview ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPreview(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 520, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}><b>{t('uidsn.previewTitle', 'Form 미리보기')} — {FORM_NAME} v{version} {t('uidsn.previewRenderNote', '(동적 렌더, TBX-003)')}</b><span style={{ flex: 1 }} /><span style={{ cursor: 'pointer' }} onClick={() => setShowPreview(false)}>✕</span></div>
            <div style={{ position: 'relative', height: 340, margin: 10, border: '1px solid var(--line)', background: '#FAFBFC', overflow: 'hidden' }}>
              {widgets.map((w) => (
                <div key={w.id} style={{ position: 'absolute', left: w.x, top: w.y, width: w.w }}>
                  {w.kind === 'Button' || w.kind === 'Push' ? (
                    <Btn style={{ width: '100%', justifyContent: 'center' }} title={w.action ? `${w.action.op} → ${w.action.target || w.action.data || '-'}` : undefined}
                      onClick={() => say(w.action ? `동작 실행 — ${w.action.op} → ${w.action.target || w.action.data || '(대상 미지정)'} (TBX-003)` : `동작 미설정 — Set-up 에서 연결 (${w.label})`)}>{w.label}</Btn>)
                    : w.kind === 'Combo' ? (
                      <select className="in" data-bound-combo={w.bind ? `${w.bind.table}.${w.bind.column}` : undefined} style={{ width: '100%', height: w.h }} aria-label={w.label}>
                        {(bindPreview[w.id] ?? [w.label]).map((o) => <option key={o}>{o}</option>)}
                      </select>)
                    : w.kind === 'Check' ? <label style={{ fontSize: 11 }}><input type="checkbox" /> {w.label}</label>
                    : <input className="in" style={{ width: '100%', height: w.h }} placeholder={w.label} aria-label={w.label} />}
                </div>
              ))}
            </div>
            <div style={{ padding: '0 10px 10px', fontSize: 10, color: 'var(--txt-mute)' }}>{t('uidsn.previewCaption', '위젯 {n}개 — 게시(승인) 후 처리 Form 으로 사용됩니다 (tbx_ui_form v{v}).').replace('{n}', String(widgets.length)).replace('{v}', String(version))}</div>
          </div>
        </div>
      ) : null}
      {setupOpen && sel ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSetupOpen(false)}>
          <div data-setup-dialog style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 380, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}><b>{t('uidsn.setupTitle', 'Widget Set-up')} — {sel.id} ({sel.kind})</b><span style={{ flex: 1 }} /><span style={{ cursor: 'pointer' }} onClick={() => setSetupOpen(false)}>✕</span></div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
              <div style={{ fontWeight: 600 }}>{t('uidsn.setupAction', '동작 (Commend set-up macro)')}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="in" value={dlg.op} aria-label="동작" onChange={(e) => setDlg((d) => ({ ...d, op: e.target.value }))} style={{ width: 110 }}>
                  <option value="">{t('uidsn.opNone', '(없음)')}</option>
                  {ACTION_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input className="in" value={dlg.target} placeholder={t('uidsn.targetPh', '대상 (Table·화면·URL)')} aria-label="대상" onChange={(e) => setDlg((d) => ({ ...d, target: e.target.value }))} style={{ flex: 1 }} />
              </div>
              <input className="in" value={dlg.data} placeholder={t('uidsn.dataPh', 'Data (필드·파라미터)')} aria-label="Data" onChange={(e) => setDlg((d) => ({ ...d, data: e.target.value }))} />
              {sel.kind === 'Combo' ? (
                <>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{t('uidsn.setupBind', 'Combo Data set-up — 테이블 열 바인딩')}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select className="in" value={dlg.table} aria-label="테이블" onChange={(e) => setDlg((d) => ({ ...d, table: e.target.value, column: '' }))} style={{ width: 130 }}>
                      <option value="">{t('uidsn.tablePh', '(테이블)')}</option>
                      {Object.keys(BIND_TABLES).map((tb) => <option key={tb} value={tb}>{tb}</option>)}
                    </select>
                    <select className="in" value={dlg.column} aria-label="열" onChange={(e) => setDlg((d) => ({ ...d, column: e.target.value }))} style={{ width: 120 }}>
                      <option value="">{t('uidsn.columnPh', '(열)')}</option>
                      {(BIND_TABLES[dlg.table] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Btn data-bind-test disabled={!dlg.table || !dlg.column} onClick={testBind}>{t('uidsn.bindTest', '조회')}</Btn>
                  </div>
                  {dlgVals ? <div data-bind-vals style={{ fontSize: 10, color: 'var(--txt-dim)', maxHeight: 60, overflow: 'auto' }}>{dlgVals.length ? dlgVals.join(' · ') : t('uidsn.bindEmpty', '값 없음')}</div> : null}
                </>
              ) : null}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                <Btn onClick={() => setSetupOpen(false)}>{t('common.close', '닫기')}</Btn>
                <Btn variant="pri" data-setup-save onClick={saveSetup}>{t('common.apply', '적용')}</Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title={t('uidsn.widgetBox', 'Widget Box — 클릭=배치')} noPad>
            <div className="tree2">
              {WIDGET_PALETTE.map((g) => (
                <div key={g.group}>
                  <div className="tn"><span className="pm">−</span><b>{g.group}</b></div>
                  {g.items.map((it) => <div key={it} className="tn l2" onClick={() => addWidget(it)}><span className="pm">·</span>{it}</div>)}
                </div>
              ))}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 4, flex: 1 }}>
          <div className="cvs" style={{ flex: 1, minHeight: 300 }}>
            {widgets.map((w) => (
              <div key={w.id} className={`m2 ${selId === w.id ? 'sel' : ''}`} style={{ left: w.x, top: w.y, width: w.w, height: w.h }} onClick={() => setSelId(w.id)} onDoubleClick={() => openSetup(w)} title={t('uidsn.dblSetup', '더블클릭 = Set-up (동작·바인딩)')}>{w.label}</div>
            ))}
            <div style={{ position: 'absolute', left: 10, bottom: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('uidsn.flowHint', '팔레트 클릭 배치 → 속성 편집 → 동작 Templet 바인딩 → 저장·버전 → 승인·게시')}</div>
          </div>
          {status ? <div style={{ fontSize: 11, color: status.err ? 'var(--err)' : 'var(--run)' }}>{status.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="Object Inspector" noPad>
            <table className="g"><thead><tr><th>Object</th><th>Class</th></tr></thead>
              <tbody>{widgets.map((w) => (
                <tr key={w.id} className={selId === w.id ? 'sel' : undefined} onClick={() => setSelId(w.id)}><td className="code">{w.id}</td><td>{w.kind}</td></tr>
              ))}</tbody></table>
          </GroupBox>
          <GroupBox title={`Property Editor — ${sel?.id ?? '—'}`} noPad>
            <table className="g"><thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>class</td><td className="code">{sel?.kind ?? '-'}</td></tr>
                <tr><td>text</td><td>{sel?.label ?? '-'}</td></tr>
                <tr><td>geometry</td><td className="code">{sel ? `${sel.x},${sel.y} ${sel.w}×${sel.h}` : '-'}</td></tr>
                <tr><td>action</td><td className="code">{sel?.action ? `${sel.action.op} → ${sel.action.target || sel.action.data || '-'}` : '-'}</td></tr>
                <tr><td>data bind</td><td className="code">{sel?.bind ? `${sel.bind.table}.${sel.bind.column}` : '-'}</td></tr>
              </tbody></table>
            <div style={{ padding: 4, textAlign: 'right' }}>
              <Btn data-widget-setup disabled={!sel} onClick={() => openSetup()}>⚙ {t('uidsn.setupBtn', 'Set-up (동작·바인딩)')}</Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('uidsn.aiTitle', '[ UI 개발 AI ]')}>
            <input className="in" style={{ width: '100%' }} value={aiText} aria-label="AI 설명" placeholder={t('uidsn.aiPlaceholder', '개발할 Application 설명 입력…')} onChange={(e) => setAiText(e.target.value)} />
            <div style={{ textAlign: 'right', marginTop: 4 }}><Btn variant="run" onClick={runAi}>{t('uidsn.aiDraft', 'UI 초안 제안')}</Btn></div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>{t('uidsn.aiHintShort', '→ 용도 / 항목 / 필요 DB Table 정리 후 Templet 제안')}</div>
          </GroupBox>
          {dirty ? <Chip tone="warn">{t('uidsn.unsaved', '미저장 변경')}</Chip> : null}
        </div>
      </div>
    </div>
  )
}
