/** S-2-2 Toolbox Macro Studio (W-07, 슬라이드 29·59) — 4-Way Sync
 *  (Prompt↔Macro↔Flowchart↔Coding) · Test Run 통과(TESTED)해야 승인 요청 가능. */
import { useMemo, useState } from 'react'
import {
  FUNCTIONS, MACRO_CODING_PY, MACRO_DESC, MACRO_FORMULA, MACRO_META, MACRO_PROMPT,
} from '../../api/mock/dataMore'
import { TABLE12_ROWS } from '../../api/mock/dataCode'
import { aiService, macroService } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const VIEWS = ['Prompt', 'Macro', 'Flowchart'] as const

export function MacroStudioScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [view, setView] = useState<typeof VIEWS[number]>('Prompt')
  const [prompt, setPrompt] = useState(MACRO_PROMPT)
  const [formula, setFormula] = useState(MACRO_FORMULA)
  const [tested, setTested] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [generated, setGenerated] = useState(false)

  const [aiDesc, setAiDesc] = useState<string | null>(null)
  const [aiCoding, setAiCoding] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const generate = () => {
    setBusy(true)
    void (async () => {
      try {
        const r = await aiService.macroGenerate(prompt)
        if (r === null) {
          setFormula(MACRO_FORMULA)
          shell.setStatusMsg('AI 생성 (mock) — 백엔드 불가')
        } else {
          setFormula(r.formula)
          setAiDesc(r.description)
          setAiCoding(r.coding)
          shell.setStatusMsg(r.mode === 'live'
            ? 'AI 생성 ✓ (Claude) — Macro·Description·Coding 동기화, Run 으로 검증하십시오 (AI-005)'
            : `AI 생성 (${r.mode === 'sample' ? '샘플 모드 — API 키 미설정' : `오류: ${r.error}`})`)
        }
        setGenerated(true)
        setTested(false)
      } finally {
        setBusy(false)
      }
    })()
  }

  const testRun = () => {
    void (async () => {
      const r = await macroService.evaluate(formula, { MC: 520, FES: 15 })
      if (r === null) {
        // mock 폴백 — 엔진 없음
        setResult(786)
        setTested(true)
        shell.setStatusMsg('Test Run (mock) — 입력 {MC:520, FES:15} → 786')
        return
      }
      if (!r.ok) {
        setTested(false)
        setResult(null)
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Macro 오류 — {r.error}</span>)
        return
      }
      setResult(r.value ?? null)
      setTested(true)
      shell.setStatusMsg(
        `Test Run ✓ (ENG-01 실평가) — {MC:520, FES:15} → ${r.value} · ${(r.trace ?? []).join(' · ')} · 순환 없음 ✓`)
    })()
  }

  useFKeys(active, useMemo(() => ({ F9: testRun }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fill-col">
      <div className="qband">
        {VIEWS.map((v) => (
          <Btn key={v} variant={view === v ? 'pri' : 'default'} onClick={() => setView(v)}>{v}</Btn>
        ))}
        <span className="sep" />
        <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>
          Person: {MACRO_META.person} · Ver: {MACRO_META.ver} · DOC No: {MACRO_META.docNo}
        </span>
        <label>Grade</label>
        <Combo width={62} value={MACRO_META.grade} options={['S-1', 'S-2', 'S-3']} />
        <span style={{ flex: 1 }} />
        {tested ? <Chip tone="info">TESTED</Chip> : <Chip tone="warn">미검증</Chip>}
        <Btn onClick={() => shell.setStatusMsg('저장 — v0.3 (DRAFT)')}>저장 (v0.3)</Btn>
        <Btn variant="pri" disabled={!tested}
          onClick={() => shell.setStatusMsg('검증·승인 요청 — 승인함(M-15-2) 등록')}>
          검증·승인 요청
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title="[ Data Information Call ]">
            <div className="frm c2">
              <label>Source</label>
              <Combo value="Table" options={['Table', 'Variant', 'Constant']} />
              <label>Address</label>
              <Combo value="/T/ENG/VARIANT" options={['/T/ENG/VARIANT', '/T/SALES']} />
            </div>
            <table className="g" style={{ marginTop: 4 }}>
              <thead><tr><th>Item</th><th>A</th><th>C</th><th>E</th></tr></thead>
              <tbody>
                {TABLE12_ROWS.slice(0, 2).map((r) => (
                  <tr key={r.key}>
                    <td className="code">{r.key}</td>
                    <td className="num">{r.cols[0]}</td>
                    <td className="num">{r.cols[2]}</td>
                    <td className="num">{r.cols[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="[ 함수 마법사 ]">
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {FUNCTIONS.map((f) => (
                <span key={f} className="b" style={{ height: 18, fontSize: 10 }}
                  onClick={() => shell.setStatusMsg(`함수 삽입 — ${f}`)}>{f}</span>
              ))}
            </div>
          </GroupBox>
          <GroupBox title="[ 기능 찾기 ]">
            <input className="in" style={{ width: '100%' }} placeholder="자연어로 기능 검색…"
              aria-label="기능 찾기" />
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title="Prompt">
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="in" style={{ flex: 1 }} value={prompt} aria-label="Prompt"
                onChange={(e) => { setPrompt(e.target.value); setGenerated(false) }} />
              <Btn variant="pri" disabled={busy} onClick={generate}>
                {busy ? '생성 중…' : '▶ 생성 (AI)'}
              </Btn>
            </div>
          </GroupBox>
          <GroupBox title="Macro — Excel 호환 문법 (편집 가능)" right={<>
            {result != null ? <b style={{ color: 'var(--ok)' }}>{result}</b> : null}
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={testRun}>Run F9</Btn>
          </>}>
            <input className="in" style={{ width: '100%', fontFamily: 'Consolas, monospace', color: 'var(--title-navy)' }}
              value={formula} aria-label="Macro 수식"
              onChange={(e) => { setFormula(e.target.value); setTested(false); setResult(null) }} />
            {!generated && formula !== MACRO_FORMULA
              ? <Chip tone="warn">Prompt 와 불일치 — 동기화 제안</Chip> : null}
          </GroupBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, flex: 1, minHeight: 0 }}>
            <GroupBox title="Flowchart">
              <Cvs blocks={[
                { id: 'f1', name: 'Impeller 참조', sub: 'Table1', x: 20, y: 12, w: 110, h: 34 },
                { id: 'f2', name: 'Casing 폭', sub: 'Table2', x: 20, y: 60, w: 110, h: 34 },
                { id: 'f3', name: 'Bearing 폭', sub: 'Table3', x: 20, y: 108, w: 110, h: 34 },
                { id: 'f4', name: 'Σ Shaft 길이', x: 150, y: 60, w: 90, h: 34 },
              ]} style={{ height: 160 }} />
            </GroupBox>
            <GroupBox title="Description">
              <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
                {aiDesc ?? MACRO_DESC}
              </div>
            </GroupBox>
            <GroupBox title="Coding (AI)">
              <Fx dark style={{ height: '100%', minHeight: 140 }}>{aiCoding ?? MACRO_CODING_PY}</Fx>
            </GroupBox>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            4-Way Sync — 한쪽 수정 시 나머지 동기화 제안 · 간단 계산=Macro / 복잡=Coding(AI) (TBX-008/010)
          </div>
        </div>
      </div>
    </div>
  )
}
