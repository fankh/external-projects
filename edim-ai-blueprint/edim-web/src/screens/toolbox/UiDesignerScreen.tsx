/** S-2-1 Toolbox UI Designer (W-08, 슬라이드 27·28) — Widget 팔레트 클릭 배치 ·
 *  Object Inspector · layout_def 저장→승인→게시 (TBX-001~004). */
import { useState } from 'react'
import { INITIAL_WIDGETS, WIDGET_PALETTE, type Widget } from '../../api/mock/dataMore'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

let widgetSeq = 5

export function UiDesignerScreen(_props: ScreenProps) {
  const shell = useShell()
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS)
  const [selId, setSelId] = useState<string | null>('w1')
  const [dirty, setDirty] = useState(false)
  const [aiText, setAiText] = useState('')

  const sel = widgets.find((w) => w.id === selId) ?? null

  const addWidget = (kind: string) => {
    const id = `w${widgetSeq++}`
    setWidgets((prev) => [...prev, {
      id, kind, label: kind,
      x: 30 + (prev.length % 4) * 80, y: 260 - (prev.length % 3) * 40, w: 96, h: 24,
    }])
    setSelId(id)
    setDirty(true)
    shell.setStatusMsg(`위젯 배치 — ${kind} (동작은 Set-up Templet 창에서 연결, TBX-002)`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          Form — CPQ / Selection {dirty ? '*' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => shell.setStatusMsg('미리보기 — 동적 렌더러 실행 (TBX-003)')}>미리보기</Btn>
        <Btn>버전</Btn>
        <Btn variant="pri" onClick={() => shell.setStatusMsg('layout_def(JSONB) 저장 → 승인 후 게시')}>
          게시 (승인 후)
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title="Work Hierarchy" noPad>
            <div className="tree2">
              <div className="tn"><span className="pm">−</span>CPQ</div>
              <div className="tn l2 sel"><span className="pm">·</span>Selection</div>
              <div className="tn l2"><span className="pm">·</span>Technical · Document</div>
              <div className="tn"><span className="pm">+</span>TLM</div>
              <div className="tn"><span className="pm">+</span>Print Form</div>
            </div>
          </GroupBox>
          <GroupBox title="Widget Box — 클릭=배치" noPad>
            <div className="tree2">
              {WIDGET_PALETTE.map((g) => (
                <div key={g.group}>
                  <div className="tn"><span className="pm">−</span><b>{g.group}</b></div>
                  {g.items.map((it) => (
                    <div key={it} className="tn l2" onClick={() => addWidget(it)}>
                      <span className="pm">·</span>{it}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 4 }}>
          <div className="cvs" style={{ flex: 1, minHeight: 300 }}>
            {widgets.map((w) => (
              <div key={w.id}
                className={`m2 ${selId === w.id ? 'sel' : ''}`}
                style={{ left: w.x, top: w.y, width: w.w, height: w.h }}
                onClick={() => setSelId(w.id)}>
                {w.label}
              </div>
            ))}
            <div style={{ position: 'absolute', left: 10, bottom: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>
              팔레트 클릭 배치 → 속성 편집 → 동작 Templet 바인딩 → 저장·버전 → 승인·게시
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            Button → Command Templet (복사·대상·Data) · Combo → Data Set-up (Table 바인딩)
          </div>
        </div>
        <div className="split-h" />
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="Object Inspector" noPad>
            <table className="g">
              <thead><tr><th>Object</th><th>Class</th></tr></thead>
              <tbody>
                {widgets.map((w) => (
                  <tr key={w.id} className={selId === w.id ? 'sel' : undefined}
                    onClick={() => setSelId(w.id)}>
                    <td className="code">{w.id}</td>
                    <td>{w.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={`Property Editor — ${sel?.id ?? '—'}`} noPad>
            <table className="g">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>class</td><td className="code">{sel?.kind ?? '-'}</td></tr>
                <tr><td>text</td><td>{sel?.label ?? '-'}</td></tr>
                <tr><td>geometry</td><td className="code">{sel ? `${sel.x},${sel.y} ${sel.w}×${sel.h}` : '-'}</td></tr>
                <tr><td>font</td><td>Pretendard 11.5</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="[ UI 개발 AI ]">
            <input className="in" style={{ width: '100%' }} value={aiText} aria-label="AI 설명"
              placeholder="개발할 Application 설명 입력…"
              onChange={(e) => setAiText(e.target.value)} />
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Btn variant="run" onClick={() => {
                if (!aiText.trim()) return
                addWidget('Form')
                shell.setStatusMsg('AI 초안 — 용도/항목/필요 Table 정리 후 Templet 제안 (TBX-004)')
              }}>UI 초안 제안</Btn>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>
              → 용도 / 항목 / 필요 DB Table 정리 후 Templet 제안 · 호출하여 Customizing
            </div>
          </GroupBox>
          {dirty ? <Chip tone="warn">미저장 변경</Chip> : null}
        </div>
      </div>
    </div>
  )
}
