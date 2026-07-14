/** S-2-2 Toolbox Macro Studio (W-07, 슬라이드 29·59) — 4-Way Sync
 *  (Prompt↔Macro↔Flowchart↔Coding) · Test Run 통과(TESTED)해야 승인 요청 가능. */
import { useEffect, useMemo, useState } from 'react'
import {
  FUNCTIONS, MACRO_CODING_PY, MACRO_DESC, MACRO_FORMULA, MACRO_META, MACRO_PROMPT,
} from '../../api/mock/dataMore'
import { TABLE12_ROWS } from '../../api/mock/dataCode'
import {
  aiService, approvalService, macroLibService, macroService,
  type FlowchartNode, type MacroFn, type MacroRefRow,
} from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const VIEWS = ['Prompt', 'Macro', 'Flowchart'] as const

export function MacroStudioScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [view, setView] = useState<typeof VIEWS[number]>('Prompt')
  const [prompt, setPrompt] = useState(MACRO_PROMPT)
  const [formula, setFormula] = useState(MACRO_FORMULA)
  const [tested, setTested] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [generated, setGenerated] = useState(false)

  const [aiDesc, setAiDesc] = useState<string | null>(null)
  const [aiCoding, setAiCoding] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // B20 — 4-Way 전체 필드 + CODING 모드 + 참조 + 함수 검색
  const [applyType, setApplyType] = useState<'MACRO' | 'CODING'>('MACRO')
  const [codeText, setCodeText] = useState<string | null>(null)
  const [descText, setDescText] = useState<string | null>(null)
  const [flowNodes, setFlowNodes] = useState<FlowchartNode[] | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [refs, setRefs] = useState<MacroRefRow[] | null>(null)
  const [fnQuery, setFnQuery] = useState('')
  const [fns, setFns] = useState<MacroFn[] | null>(null)

  // Macro 라이브러리 실데이터 로드 (tbx_macro) — 4-Way 전체 필드 복원 (B20)
  useEffect(() => {
    void macroLibService.list().then((rows) => {
      const m = rows?.find((r) => r.prompt) ?? rows?.[0]
      if (m && rows) {
        if (m.prompt) setPrompt(m.prompt)
        setFormula(m.expr)
        setApplyType(m.applyType)
        if (m.codeText) setCodeText(m.codeText)
        if (m.description) setDescText(m.description)
        if (m.flowchartDef?.nodes?.length) setFlowNodes(m.flowchartDef.nodes)
        setVersion(m.version)
        shell.setStatusMsg(
          `Macro 라이브러리 로드 — ${m.name} v${m.version} (4-Way 복원: 수식·코드·플로차트·설명)`)
        void macroLibService.refs(m.name).then(setRefs)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 함수 자연어 검색 (TBX-014) — 디바운스 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!fnQuery.trim()) { setFns(null); return }
      void macroLibService.searchFunctions(fnQuery).then(setFns)
    }, 300)
    return () => clearTimeout(timer)
  }, [fnQuery])

  const saveAll = async (): Promise<boolean> => {
    const r = await macroLibService.save('Shaft 길이 계산', formula, prompt, {
      codeText: aiCoding ?? codeText ?? '',
      descriptionText: aiDesc ?? descText ?? '',
      applyType,
      ...(tested && result != null
        ? { testInput: { MC: 520, FES: 15 }, testResult: { value: result, ok: true } }
        : {}),
    })
    if (r) {
      setVersion(r.version)
      void macroLibService.refs('Shaft 길이 계산').then(setRefs)
    }
    return r !== null
  }

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
    if (applyType === 'CODING') {
      shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>
        CODING 모드 — 엔진 v1 은 수식(MACRO)만 실행합니다 (코드 실행은 런타임 협의 대상)</span>)
      return
    }
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

  useFKeys(active, useMemo(() => ({
    F3: () => {
      // F5 — Macro 삭제 실배선 ('해당 동작이 없습니다' 폴백 제거): 참조 존재 시 서버 409 정직 표기
      void macroLibService.remove('Shaft 길이 계산').then((ok) => shell.setStatusMsg(ok
        ? 'Macro 삭제 ✓ — Shaft 길이 계산 (MACRO_DELETE 감사)'
        : <span style={{ color: 'var(--err)' }}>삭제 불가 — 백엔드 연결 필요 (mock)</span>))
        .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
    },
    F9: testRun,
    F12: () => {
      void saveAll().then((ok) => shell.setStatusMsg(ok
        ? '저장 ✓ — tbx_macro 4-Way 영속 (수식·코드·플로차트·설명 + Test, 참조 재구성)'
        : <span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>))
    },
  }), [formula, prompt, applyType, tested, result, aiCoding, aiDesc, codeText, descText])) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fill-col">
      <div className="qband">
        {VIEWS.map((v) => (
          <Btn key={v} variant={view === v ? 'pri' : 'default'} onClick={() => setView(v)}>{v}</Btn>
        ))}
        <span className="sep" />
        <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>
          Person: {MACRO_META.person} · Ver: {version != null ? `v${version}` : MACRO_META.ver} · DOC No: {MACRO_META.docNo}
        </span>
        <label>Grade</label>
        <Combo width={62} value={MACRO_META.grade} options={['S-1', 'S-2', 'S-3']} />
        <label>{t('studio.applyType', '모드')}</label>
        <Combo width={86} value={applyType} options={['MACRO', 'CODING']}
          onChange={(v) => {
            setApplyType(v as 'MACRO' | 'CODING')
            if (v === 'CODING') setTested(false)
          }} />
        <span style={{ flex: 1 }} />
        {applyType === 'CODING'
          ? <Chip tone="info">{t('studio.codingMode', 'CODING — 엔진 v1 미실행 (등록·관리)')}</Chip>
          : tested ? <Chip tone="info">TESTED</Chip> : <Chip tone="warn">{t('studio.notTested', '미검증')}</Chip>}
        <Btn onClick={() => {
          void saveAll().then((ok) => shell.setStatusMsg(ok
            ? '저장 ✓ — tbx_macro 4-Way 영속 (수식·코드·플로차트·설명 + Test, 참조 재구성)'
            : <span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>))
        }}>{t('studio.saveVer2', '저장 (4-Way)')}</Btn>
        <Btn variant="pri" disabled={applyType === 'MACRO' ? !tested : false}
          onClick={() => {
            void (async () => {
              const saved = await saveAll()
              const ok = saved && await approvalService.request(
                'tbx_macro', `Macro 검증·승인 — Shaft 길이 계산 (Test ${result ?? '-'})`)
              shell.setStatusMsg(ok
                ? '검증·승인 요청 ✓ — 승인함(M-15-2) 등록 · 승인권자 알림 발송'
                : <span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요</span>)
            })()
          }}>
          {t('studio.verifyApprove', '검증·승인 요청')}
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
          <GroupBox title={t('studio.fnWizard', '[ 함수 마법사 ]')}>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {FUNCTIONS.map((f) => (
                <span key={f} className="b" style={{ height: 18, fontSize: 10 }}
                  onClick={() => {
                    // 수식 끝에 함수 골격 삽입 (실배선 — B21 no-op 정리 선반영)
                    setFormula((cur) => `${cur}${cur.trim() ? ' ' : '='}${f.split(' ')[0]}()`)
                    setTested(false)
                    shell.setStatusMsg(`함수 삽입 ✓ — ${f} (수식 끝에 골격 추가)`)
                  }}>{f}</span>
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('studio.findFeature', '[ 기능 찾기 ]')} noPad>
            <div style={{ padding: 6 }}>
              <input className="in" style={{ width: '100%' }} value={fnQuery}
                placeholder={t('studio.searchNl', '자연어로 기능 검색… (예: 반올림, 합계)')}
                aria-label="기능 찾기" onChange={(e) => setFnQuery(e.target.value)} />
            </div>
            {fns !== null ? (
              fns.length ? (
                <div data-fn-results style={{ padding: '0 6px 6px' }}>
                  {fns.map((f) => (
                    <div key={f.name} style={{ fontSize: 10.5, padding: '2px 0', cursor: 'pointer' }}
                      title={f.sig}
                      onClick={() => {
                        setFormula((cur) => `${cur}${cur.trim() ? ' ' : '='}${f.name}()`)
                        setTested(false)
                        shell.setStatusMsg(`함수 삽입 ✓ — ${f.sig}`)
                      }}>
                      <b style={{ fontFamily: 'Consolas, monospace' }}>{f.name}</b>
                      <span style={{ color: 'var(--txt-mute)' }}> — {f.desc}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '0 6px 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>
                  {t('studio.noFnResult', '일치하는 기능 없음')}
                </div>
              )
            ) : null}
          </GroupBox>
          <GroupBox title={t('studio.refsTitle', '[ 참조 (tbx_macro_ref) ]')}
            right={refs !== null && refs.length ? <Chip tone="ok">{refs.length}</Chip> : null}>
            {refs === null ? (
              <span style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</span>
            ) : refs.length ? (
              <div data-macro-refs style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {refs.map((r, i) => <Chip key={i} tone="info">{r.refType}:{r.target}</Chip>)}
              </div>
            ) : (
              <span style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('studio.noRefs', 'Table 참조 없음')}</span>
            )}
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title="Prompt">
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="in" style={{ flex: 1 }} value={prompt} aria-label="Prompt"
                onChange={(e) => { setPrompt(e.target.value); setGenerated(false) }} />
              <Btn variant="pri" disabled={busy} onClick={generate}>
                {busy ? t('studio.generating', '생성 중…') : t('studio.generateAi', '▶ 생성 (AI)')}
              </Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('studio.macroTitle', 'Macro — Excel 호환 문법 (편집 가능)')} right={<>
            {result != null ? <b style={{ color: 'var(--ok)' }}>{result}</b> : null}
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={testRun}>Run F9</Btn>
          </>}>
            <input className="in" style={{ width: '100%', fontFamily: 'Consolas, monospace', color: 'var(--title-navy)' }}
              value={formula} aria-label="Macro 수식"
              onChange={(e) => { setFormula(e.target.value); setTested(false); setResult(null) }} />
            {!generated && formula !== MACRO_FORMULA
              ? <Chip tone="warn">{t('studio.syncSuggest', 'Prompt 와 불일치 — 동기화 제안')}</Chip> : null}
          </GroupBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, flex: 1, minHeight: 0 }}>
            <GroupBox title="Flowchart"
              right={flowNodes ? <Chip tone="ok">flowchart_def</Chip> : <Chip tone="warn">MOCK</Chip>}>
              <Cvs blocks={flowNodes ?? [
                { id: 'f1', name: 'Impeller 참조', sub: 'Table1', x: 20, y: 12, w: 110, h: 34 },
                { id: 'f2', name: 'Casing 폭', sub: 'Table2', x: 20, y: 60, w: 110, h: 34 },
                { id: 'f3', name: 'Bearing 폭', sub: 'Table3', x: 20, y: 108, w: 110, h: 34 },
                { id: 'f4', name: 'Σ Shaft 길이', x: 150, y: 60, w: 90, h: 34 },
              ]} style={{ height: 160 }} />
            </GroupBox>
            <GroupBox title="Description"
              right={descText ? <Chip tone="ok">description_text</Chip> : null}>
              <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
                {aiDesc ?? descText ?? MACRO_DESC}
              </div>
            </GroupBox>
            <GroupBox title={applyType === 'CODING' ? 'Coding (주 실행 — CODING 모드)' : 'Coding (AI)'}
              right={codeText ? <Chip tone="ok">code_text</Chip> : null}>
              <Fx dark style={{ height: '100%', minHeight: 140 }}>{aiCoding ?? codeText ?? MACRO_CODING_PY}</Fx>
            </GroupBox>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            {t('studio.syncHint', '4-Way Sync — 한쪽 수정 시 나머지 동기화 제안 · 간단 계산=Macro / 복잡=Coding(AI) (TBX-008/010)')}
          </div>
        </div>
      </div>
    </div>
  )
}
