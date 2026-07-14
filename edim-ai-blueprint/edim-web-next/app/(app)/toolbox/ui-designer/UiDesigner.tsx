'use client'

import { useRef, useState } from 'react'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { useEditHistory } from '@/hooks/useEditHistory'
import { saveLayout, publishForm, aiSuggest, type Widget } from './actions'

const FORM_NAME = 'CPQ-Selection'
const WIDGET_PALETTE = [
  { group: 'Layouts', items: ['Vertical', 'Horizontal', 'Grid', 'Form'] },
  { group: 'Buttons', items: ['Push', 'Radio', 'Check'] },
  { group: 'Input', items: ['Combo', 'Line Edit', 'Text', 'Date'] },
  { group: 'Views', items: ['Table', 'Tree', 'List'] },
  { group: 'Containers', items: ['Frame', 'Canvas', 'Group Box'] },
]

export function UiDesigner({ initialWidgets, initialVersion }: { initialWidgets: Widget[]; initialVersion: number }) {
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
        <Btn onClick={() => setShowPreview(true)}>미리보기</Btn>
        <span className="b ic" title="실행 취소" onClick={() => window.dispatchEvent(new CustomEvent('edim-undo'))}>↶</span>
        <span className="b ic" title="다시 실행" onClick={() => window.dispatchEvent(new CustomEvent('edim-redo'))}>↷</span>
        <Btn onClick={() => { void doSave() }}>저장 F12</Btn>
        <Btn variant="pri" onClick={publish}>게시 (승인 후)</Btn>
      </div>
      {showPreview ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPreview(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 520, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}><b>Form 미리보기 — {FORM_NAME} v{version} (동적 렌더, TBX-003)</b><span style={{ flex: 1 }} /><span style={{ cursor: 'pointer' }} onClick={() => setShowPreview(false)}>✕</span></div>
            <div style={{ position: 'relative', height: 340, margin: 10, border: '1px solid var(--line)', background: '#FAFBFC', overflow: 'hidden' }}>
              {widgets.map((w) => (
                <div key={w.id} style={{ position: 'absolute', left: w.x, top: w.y, width: w.w }}>
                  {w.kind === 'Button' || w.kind === 'Push' ? <Btn style={{ width: '100%', justifyContent: 'center' }}>{w.label}</Btn>
                    : w.kind === 'Combo' ? <select className="in" style={{ width: '100%', height: w.h }} aria-label={w.label}><option>{w.label}</option></select>
                    : w.kind === 'Check' ? <label style={{ fontSize: 11 }}><input type="checkbox" /> {w.label}</label>
                    : <input className="in" style={{ width: '100%', height: w.h }} placeholder={w.label} aria-label={w.label} />}
                </div>
              ))}
            </div>
            <div style={{ padding: '0 10px 10px', fontSize: 10, color: 'var(--txt-mute)' }}>위젯 {widgets.length}개 — 게시(승인) 후 처리 Form 으로 사용됩니다 (tbx_ui_form v{version}).</div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title="Widget Box — 클릭=배치" noPad>
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
              <div key={w.id} className={`m2 ${selId === w.id ? 'sel' : ''}`} style={{ left: w.x, top: w.y, width: w.w, height: w.h }} onClick={() => setSelId(w.id)}>{w.label}</div>
            ))}
            <div style={{ position: 'absolute', left: 10, bottom: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>팔레트 클릭 배치 → 속성 편집 → 동작 Templet 바인딩 → 저장·버전 → 승인·게시</div>
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
              </tbody></table>
          </GroupBox>
          <GroupBox title="[ UI 개발 AI ]">
            <input className="in" style={{ width: '100%' }} value={aiText} aria-label="AI 설명" placeholder="개발할 Application 설명 입력…" onChange={(e) => setAiText(e.target.value)} />
            <div style={{ textAlign: 'right', marginTop: 4 }}><Btn variant="run" onClick={runAi}>UI 초안 제안</Btn></div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>→ 용도 / 항목 / 필요 DB Table 정리 후 Templet 제안</div>
          </GroupBox>
          {dirty ? <Chip tone="warn">미저장 변경</Chip> : null}
        </div>
      </div>
    </div>
  )
}
