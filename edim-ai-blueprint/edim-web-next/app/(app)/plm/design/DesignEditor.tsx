'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CanvasBlock, CadDocument, DimensionDef, DwgRelationRow } from '@/lib/cadTypes'
import { CadSvg, type CadEditOp } from '@/components/CadSvg'
import { applyMovesLocal } from '@/components/cadOps'
import { Btn, Chip, Combo, Fx, GroupBox, Sep } from '@/components/controls'
import { CommandLine, Cvs } from '@/components/Cvs'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { useI18n } from '@/components/I18nProvider'
import { useEditHistory } from '@/hooks/useEditHistory'
import {
  evaluateMacro, cadPartDrawing, cadPartDrawingSave, cadEdit, cadView, saveDimensions, requestApproval,
} from './actions'

interface BomRow { bomId: number; partNo: string; partName: string; qty: number; assemblySeq: number | null; assemblyNote: string }

const MACRO_CODING = '=IF(MC,CC>500, Table12(E,10:25,Cos2)+Var(FES,15,F3), Table12(E,10:25,Cos1))'
const CAD_TOOLS = ['복사 CO', '이동', '반전', '연장', '삭제 E', '회전 RO', '자르기 TR', 'Block REG', '치수 DI', '특성 CH']
const TOOL_KEY: Record<string, string> = {
  '이동': 'move', '복사 CO': 'copy', '반전': 'mirror', '연장': 'extend', '삭제 E': 'erase',
  '회전 RO': 'rotate', '자르기 TR': 'trim', '특성 CH': 'properties', '치수 DI': 'dim', 'Block REG': 'block',
}
const numericDims = (src: DimensionDef[]): Record<string, number> => {
  const v: Record<string, number> = {}
  for (const d of src) { const n = Number(d.value); if (!Number.isNaN(n)) v[d.no] = n }
  return v
}
function evalDimsMock(dims: DimensionDef[]): DimensionDef[] {
  const a = Number(dims.find((d) => d.no === 'A')?.value) || 0
  return dims.map((d) => d.no === 'B' ? { ...d, value: String(a + 56) } : d.no === 'K' ? { ...d, value: String(Math.round(a * 1.62)) } : d)
}

/** DWG-024 Simulation — VARIANT 변경 → MACRO 즉시 재평가 (저장 없음). */
function SimulationPanel({ dims, onApply }: { dims: DimensionDef[]; onApply: (n: DimensionDef[]) => void }) {
  const { t } = useI18n()
  const [vars, setVars] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [live, setLive] = useState(true)
  const variantDims = dims.filter((d) => !d.value.trim().startsWith('='))
  const macroDims = dims.filter((d) => d.value.trim().startsWith('='))

  useEffect(() => {
    if (!Object.keys(vars).length) { setPreview(null); return }
    const timer = setTimeout(() => { void (async () => {
      const nums: Record<string, number> = {}
      for (const d of variantDims) { const n = Number(vars[d.no] ?? d.value); if (!Number.isNaN(n)) nums[d.no] = n }
      const out: Record<string, number> = {}
      for (const d of macroDims) {
        const r = await evaluateMacro(d.value, nums)
        if (r === null) { setLive(false); setPreview(null); return }
        if (r.ok && r.value != null) { nums[d.no] = r.value; out[d.no] = r.value }
      }
      setLive(true); setPreview(out)
    })() }, 400)
    return () => clearTimeout(timer)
  }, [vars]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!preview) return
    onApply(dims.map((d) => {
      if (vars[d.no] !== undefined && !Number.isNaN(Number(vars[d.no]))) return { ...d, value: vars[d.no] }
      if (preview[d.no] !== undefined) return { ...d, value: String(preview[d.no]) }
      return d
    }))
    setVars({}); setPreview(null)
  }

  return (
    <GroupBox title={t('editor.simPanel', 'Simulation')} noPad right={live ? <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>ENG-01</span> : <Chip tone="warn">MOCK</Chip>}>
      <div style={{ padding: 6 }}>
        <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginBottom: 4 }}>{t('editor.simHint', 'VARIANT 치수 변경 — MACRO 치수 즉시 재평가 (저장 없음)')}</div>
        <div className="frm c2">
          {variantDims.map((d) => (
            <span key={d.no} style={{ display: 'contents' }}>
              <label>{d.no}</label>
              <input className="in" style={{ width: 70 }} value={vars[d.no] ?? d.value} aria-label={`Sim ${d.no}`}
                onChange={(e) => setVars((c) => ({ ...c, [d.no]: e.target.value }))} />
            </span>
          ))}
        </div>
        {preview ? (
          <div style={{ marginTop: 4, fontSize: 11 }}>
            {macroDims.map((d) => {
              const cur = Number(d.value); const nv = preview[d.no]
              if (nv === undefined) return null
              const changed = !Number.isNaN(cur) && Math.abs(nv - cur) > 1e-9
              return (
                <div key={d.no} style={{ display: 'flex', gap: 6 }}>
                  <b style={{ width: 18 }}>{d.no}</b>
                  <span style={{ color: changed ? 'var(--title-navy)' : undefined }}>
                    {nv}{changed && !Number.isNaN(cur) ? ` (Δ ${nv - cur > 0 ? '+' : ''}${Math.round((nv - cur) * 100) / 100})` : ''}
                  </span>
                </div>
              )
            })}
            <div style={{ textAlign: 'right', marginTop: 4 }}><Btn variant="pri" onClick={apply}>{t('editor.simApply', '적용 (치수 반영)')}</Btn></div>
          </div>
        ) : null}
      </div>
    </GroupBox>
  )
}

export function DesignEditor(props: {
  initialDims: DimensionDef[]
  initialDoc: CadDocument | null
  blocks: CanvasBlock[]
  relations: DwgRelationRow[]
  bom: BomRow[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  // CAD 툴 표시 라벨 — 내부 값(tool 상태·명령 프롬프트·TOOL_KEY)은 한글 원문 유지
  const toolLabels: Record<string, string> = {
    '복사 CO': t('editor.toolCopy', '복사 CO'),
    '이동': t('editor.toolMove', '이동'),
    '반전': t('editor.toolMirror', '반전'),
    '연장': t('editor.toolExtend', '연장'),
    '삭제 E': t('editor.toolErase', '삭제 E'),
    '회전 RO': t('editor.toolRotate', '회전 RO'),
    '자르기 TR': t('editor.toolTrim', '자르기 TR'),
    '치수 DI': t('editor.toolDim', '치수 DI'),
    '특성 CH': t('editor.toolProps', '특성 CH'),
  }
  const [tool, setTool] = useState('이동')
  const [editFileId, setEditFileId] = useState<number | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [selBlock, setSelBlock] = useState<CanvasBlock | null>(props.blocks[1] ?? props.blocks[0] ?? null)
  const [dims, setDims] = useState<DimensionDef[]>(props.initialDims)
  const [editingNo, setEditingNo] = useState<string | null>(null)
  const [coord, setCoord] = useState('X 0.0  Y 0.0')
  const [evaluated, setEvaluated] = useState(false)
  const [cadMode, setCadMode] = useState(true)
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(props.initialDoc)
  const [cadOffline, setCadOffline] = useState(props.initialDoc === null)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const cadInput = useRef<HTMLInputElement>(null)
  const say = (text: string, err = false) => setStatus({ text, err })

  const hist = useEditHistory(true, dims, setDims, (kind, v) => {
    if (cadMode) loadCad(v)
    say(`${kind === 'undo' ? '실행 취소' : '다시 실행'} — 치수 이력 (A=${v.find((d) => d.no === 'A')?.value ?? '?'})`)
  })

  const loadCad = (src: DimensionDef[]) => {
    void cadPartDrawing(numericDims(src)).then((d) => {
      if (d === null) { setCadOffline(true); setCadMode(false); say('CAD 서버 연결 실패 — 편집 캔버스로 폴백', true) }
      else { setCadDoc(d); setEditFileId(null); say(`부품도 CAD — 엔티티 ${d.entities.length} (Run 제작도면과 동일 정본)`) }
    })
  }

  const onCadEdit = (ops: CadEditOp[]) => {
    if (editFileId == null) return
    const optimistic = cadDoc ? applyMovesLocal(cadDoc, ops) : null
    if (optimistic) {
      setCadDoc(optimistic)
      void cadEdit(editFileId, ops).then(() => say(`이동 반영 ✓ — ${ops.length}건 (배경 DXF 재저장)`))
        .catch((e: Error) => { void cadView(editFileId).then((d) => { if (d) setCadDoc(d) }); say(`${e.message} — 서버 복원`, true) })
      return
    }
    void cadEdit(editFileId, ops)
      .then((r) => { setCadDoc(r.document); say(`CAD 편집 ✓ — ${r.applied}건 반영 (엔티티 ${r.document.entities.length})`) })
      .catch((e: Error) => say(e.message, true))
  }

  const useTool = (tl: string) => {
    setTool(tl)
    const key = TOOL_KEY[tl]
    if (!key) { say(`${tl} — Block 삽입·치수 기입은 후속 지원`); return }
    if (!cadMode) setCadMode(true)
    if (editFileId != null) { setActiveTool(key); return }
    void cadPartDrawingSave(numericDims(dims)).then((r) => {
      if (!r) { say('편집 대상화 실패 — 백엔드 필요', true); return }
      setCadDoc(r.document); setEditFileId(r.fileId); setActiveTool(key)
      const hint = ['dim', 'block', 'line', 'circle', 'rect'].includes(key) ? '드래그하여 배치' : '블록 선택 후 적용'
      say(`CAD 편집: ${tl} — ${hint}`)
    }).catch((e: Error) => say(e.message, true))
  }

  const toggleCad = () => { const next = !cadMode; setCadMode(next); if (next && cadDoc === null && !cadOffline) loadCad(dims) }

  const exportCad = () => {
    void fetch('/api/cad/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dims: numericDims(dims) }) })
      .then(async (res) => {
        if (!res.ok) { say('DXF 내보내기 실패', true); return }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = url; a.download = 'part.dxf'; a.click(); URL.revokeObjectURL(url)
        say('DXF 내보내기 ✓ — 현재 치수 반영 (ezdxf R2010)')
      }).catch((e: Error) => say(e.message, true))
  }

  const importCad = (f: File) => {
    const form = new FormData(); form.append('uploadedFile', f); form.append('project', 'PS-61313-5')
    void fetch('/api/cad/import', { method: 'POST', body: form }).then(async (res) => {
      if (!res.ok) { say('CAD Import — 백엔드 불가', true); return }
      const r = await res.json() as { fileId: number; document: { entities: unknown[] } }
      say(`CAD Import ✓ — ${f.name} (엔티티 ${r.document.entities.length})`)
      router.push(`/detail/cad-viewer?fileId=${r.fileId}`)
    }).catch((e: Error) => say(e.message, true))
  }

  const runMacro = () => {
    void (async () => {
      const vars = numericDims(dims)
      const macroDims = dims.filter((d) => d.value.trim().startsWith('='))
      const next = [...dims]; let live = true
      for (const d of macroDims) {
        const r = await evaluateMacro(d.value, vars)
        if (r === null) { live = false; break }
        if (r.ok && r.value != null) { vars[d.no] = r.value; const i = next.findIndex((x) => x.no === d.no); next[i] = { ...next[i], value: String(r.value) } }
        else { say(`치수 ${d.no} — ${r.error}`, true); return }
      }
      if (live) { hist.push(); setDims(next); setEvaluated(true); if (cadMode) loadCad(next); say(`Macro 평가 ${macroDims.length}식 ✓ (ENG-01) — 파라메트릭 반영 (DWG-007)`) }
      else { setDims(evalDimsMock(dims)); setEvaluated(true); say('Macro 평가 (mock) — 파라메트릭 반영') }
    })()
  }

  const doSave = () => void saveDimensions(dims).then((r) => say(r ? `임시저장 ✓ — VARIANT ${r.variantSaved}건 · Macro 식 ${r.macroSaved}건` : '저장 불가 — 백엔드 연결 필요', !r))
  const doApprove = () => void requestApproval(`KDCR 3-13 Rev.B 설계 변경 — A=${dims.find((d) => d.no === 'A')?.value ?? '?'}`).then((ok) => say(ok ? '승인 요청 등록 ✓ — 승인함(M-15-2) 알림 발송' : '승인 요청 불가', !ok))

  const dimA = dims.find((d) => d.no === 'A')?.value ?? '670'
  const dimB = dims.find((d) => d.no === 'B')?.value ?? '=A+56'
  const dimK = dims.find((d) => d.no === 'K')?.value ?? '—'

  const ruleCols: GridColumn<DimensionDef>[] = [
    { key: 'no', header: 'No.', width: 28, align: 'center', render: (r) => <b>{r.no}</b> },
    { key: 'val', header: 'Dim.', width: 76, align: 'right', render: (r) => (editingNo === r.no
      ? <input autoFocus className="in" style={{ width: '100%', height: 20 }} defaultValue={r.value} aria-label={`치수 ${r.no}`}
          onBlur={(e) => { const v = e.target.value.trim(); hist.push(); setDims((p) => p.map((d) => d.no === r.no ? { ...d, value: v } : d)); setEditingNo(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      : <span onDoubleClick={() => setEditingNo(r.no)}>{r.value}</span>) },
    { key: 'bind', header: 'Set-up', width: 64, align: 'center', render: (r) => <Chip tone={r.binding === 'MACRO' ? 'info' : 'ok'}>{r.binding}</Chip> },
    { key: 'kind', header: t('editor.kindCol', '구분'), width: 50, align: 'center', render: (r) => r.kind },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="toolbar">
        <span className="b ic" title={t('editor.undo', '실행 취소 (Ctrl+Z)')} onClick={() => window.dispatchEvent(new CustomEvent('edim-undo'))}>↶</span>
        <span className="b ic" title={t('editor.redo', '다시 실행 (Ctrl+Y)')} onClick={() => window.dispatchEvent(new CustomEvent('edim-redo'))}>↷</span>
        <Sep />
        {CAD_TOOLS.map((tl) => <Btn key={tl} variant={tool === tl ? 'pri' : 'default'} onClick={() => useTool(tl)}>{toolLabels[tl] ?? tl}</Btn>)}
        <Sep />
        <input ref={cadInput} type="file" accept=".dxf,.dwg" style={{ display: 'none' }} aria-label="CAD 파일"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importCad(f); e.target.value = '' }} />
        <Btn onClick={() => cadInput.current?.click()}>{t('editor.openDxf', 'DXF 열기')}</Btn>
        <Btn onClick={exportCad}>{t('editor.exportDxf', 'DXF 내보내기')}</Btn>
        <Sep />
        <Btn variant={cadMode ? 'default' : 'pri'} onClick={() => cadMode && toggleCad()}>{t('common.edit', '편집')}</Btn>
        <Btn variant={cadMode ? 'pri' : 'default'} onClick={() => !cadMode && toggleCad()}>CAD</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1, padding: 6 }}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCoord(`X ${(e.clientX - r.left).toFixed(1)}  Y ${(e.clientY - r.top).toFixed(1)}`) }}>
          {cadMode ? (
            <div style={{ flex: 1, minHeight: 320, border: '1px solid var(--line)', background: '#fff' }}>
              {cadDoc ? <CadSvg doc={cadDoc} editable={cadMode && editFileId != null} onEdit={onCadEdit} activeTool={activeTool} onToolConsumed={() => setActiveTool(null)} />
                : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>{cadOffline ? t('editor.cadNeedsBackend', 'CAD 서버 연결 실패 — 새로고침하세요') : t('editor.drawing', '작도 중…')}</div>}
            </div>
          ) : (
            <Cvs blocks={props.blocks} selectedId={selBlock?.id ?? null} onSelect={setSelBlock}
              onOpen={(b) => router.push(`/detail/part?block=${encodeURIComponent(b.id)}&drawing=KDCR%203-13`)}
              dims={[{ x: 150, y: 16, w: 330, label: `B = ${dimB}` }, { x: 200, y: 34, w: 180, label: `A = ${dimA}` }, { x: 80, y: 292, w: 440, label: `K = ${dimK}` }]}
              labels={[{ x: 130, y: 64, text: 'C' }, { x: 460, y: 64, text: 'C' }, { x: 70, y: 120, text: 'G' }, { x: 512, y: 120, text: 'G' }, { x: 220, y: 250, text: 'D' }, { x: 390, y: 250, text: 'D' }, { x: 300, y: 264, text: 'E' }, { x: 530, y: 180, text: 'F' }]}
              style={{ flex: 1, minHeight: 320 }} />
          )}
          <CommandLine prompt={selBlock ? `${tool.split(' ')[0].toUpperCase()} 선택=${selBlock.name}  기준점 지정 >` : '명령 대기 >'} coord={`${coord} | 스냅 ON`} onCommand={(cmd) => say(`명령 실행: ${cmd}`)} />
          {status ? <div style={{ fontSize: 11, padding: '3px 4px', color: status.err ? 'var(--err)' : 'var(--run)' }}>{status.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 312, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('editor.designRule', 'Design Rule — 치수 Set-up')} noPad right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('editor.dblEdit', '더블클릭 = 편집')}</span>}>
            <DenseGrid columns={ruleCols} rows={dims} rowKey={(r) => r.no} />
          </GroupBox>
          <GroupBox title="Coding" right={<Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={runMacro}>Run F9</Btn>}>
            <Fx>{MACRO_CODING}</Fx>
            <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 3 }}>{t('editor.macroHint', 'EDIM Macro 호출 → 계산식 표시·직접 입력 가능')} {evaluated ? <Chip tone="ok">{t('editor.evaluated', '평가 ✓')}</Chip> : null}</div>
          </GroupBox>
          <GroupBox title="Part relationship set-up" noPad right={props.relations.length ? <Chip tone="ok">dwg_part_relation {props.relations.length}</Chip> : <Chip tone="warn">{t('design.none', '없음')}</Chip>}>
            {props.relations.length ? (
              <table className="g"><thead><tr><th>A / B</th><th>{t('editor.relAlign', '정렬')}</th><th>{t('editor.relContact', '접촉')}</th><th>Macro</th><th>①</th></tr></thead>
                <tbody>{props.relations.map((r) => (
                  <tr key={r.relationId}><td style={{ fontSize: 10 }}>{r.blockA} / {r.blockB}</td><td className="c">{r.align || '-'}</td><td className="c">{r.contact || '-'}</td><td style={{ fontSize: 10 }}>{r.macro ?? '-'}</td><td className="c">{r.priority}</td></tr>
                ))}</tbody></table>
            ) : <div style={{ fontSize: 10, lineHeight: 1.7, padding: 6, color: 'var(--txt-dim)' }}>{t('design.relEmpty', '관계 정의 없음 — 조건1: 수직·수평·중심 / 조건2: 접촉·좌표·각도')}</div>}
          </GroupBox>
          <SimulationPanel dims={dims} onApply={(next) => { hist.push(); setDims(next); setEvaluated(true); if (cadMode) loadCad(next); say('Simulation 적용 ✓ — 치수 반영 + CAD 재작도 (DWG-024)') }} />
          <PriorityCheckPanel dims={dims} />
          <GroupBox title={t('editor.subItemDwg', 'Sub Item DWG · 조립순서')} right={props.bom.length ? <Chip tone="ok">dwg_bom {props.bom.length}</Chip> : <Chip tone="warn">{t('design.none', '없음')}</Chip>}>
            {props.bom.length ? (
              <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                {props.bom.map((b) => <div key={b.bomId} title={b.assemblyNote}>{'①②③④⑤⑥⑦⑧⑨'[(b.assemblySeq ?? 9) - 1] ?? '◇'} {b.partName}<span style={{ color: 'var(--txt-mute)', fontSize: 10 }}> ×{b.qty} {b.partNo}</span></div>)}
                <Chip tone="info">◆ {t('editor.asmSeq', '조립순서')}</Chip>
              </div>
            ) : <div style={{ fontSize: 11, color: 'var(--txt-mute)' }}>{t('design.bomEmpty', '조립순서 BOM 없음')}</div>}
          </GroupBox>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn style={{ flex: 1, justifyContent: 'center' }} onClick={doSave}>{t('common.tempSave', '임시저장 F12')}</Btn>
            <Btn variant="pri" style={{ flex: 1, justifyContent: 'center' }} onClick={doApprove}>{t('common.requestApproval', '승인 요청')}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

/** U2 — 설계 우선순위·순환 참조 자동 점검 (슬라이드 67 [관계 진행 우선순위]).
 *  MACRO 치수의 참조 토큰(다른 치수 라벨)으로 의존 그래프 구성 → 위상 정렬(평가 순서) + 순환 경고.
 *  참조 추정은 토큰 휴리스틱(함수어 제외) — Table 열 인자와 동명 라벨은 참조로 간주될 수 있음(명시). */
const MACRO_FN_WORDS = new Set(['IF', 'IFERROR', 'AND', 'OR', 'NOT', 'SUM', 'SUMIF', 'VAR', 'PREC', 'COS', 'SIN', 'TAN', 'ABS', 'MIN', 'MAX', 'ROUND'])

function PriorityCheckPanel({ dims }: { dims: DimensionDef[] }) {
  const { t } = useI18n()
  const labels = new Set(dims.map((d) => d.no))
  const deps: Record<string, string[]> = {}
  for (const d of dims) {
    const v = d.value.trim()
    if (!v.startsWith('=')) { deps[d.no] = []; continue }
    const toks = v.toUpperCase().match(/\b[A-Z]{1,3}\b(?!\s*\()/g) ?? []
    deps[d.no] = [...new Set(toks.filter((tk) => tk !== d.no && labels.has(tk) && !MACRO_FN_WORDS.has(tk)))]
  }
  // Kahn 위상 정렬 — indegree = 자신이 참조하는 치수 수 (참조 먼저 평가), 잔여 = 순환
  const indeg: Record<string, number> = {}
  for (const k of Object.keys(deps)) indeg[k] = deps[k].length
  const order: string[] = []
  const q = Object.keys(indeg).filter((k) => indeg[k] === 0).sort()
  const rdeps: Record<string, string[]> = {}
  for (const k of Object.keys(deps)) for (const r of deps[k]) (rdeps[r] ??= []).push(k)
  const iq = [...q]
  const seen = new Set<string>()
  while (iq.length) {
    const n = iq.shift()!
    if (seen.has(n)) continue
    seen.add(n); order.push(n)
    for (const m of (rdeps[n] ?? [])) {
      indeg[m] -= 1
      if (indeg[m] === 0) iq.push(m)
    }
  }
  const cyclic = Object.keys(deps).filter((k) => !seen.has(k))
  const macroCount = dims.filter((d) => d.value.trim().startsWith('=')).length
  return (
    <GroupBox title={t('editor.priorityCheck', '우선순위·순환 점검 (U2)')} noPad
      right={cyclic.length
        ? <Chip tone="err">{t('editor.cycleFound', '순환 {n}').replace('{n}', String(cyclic.length))}</Chip>
        : <Chip tone="ok">{t('editor.noCycle', '순환 없음')}</Chip>}>
      <div data-priority-check style={{ padding: 6, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          <span style={{ color: 'var(--txt-mute)' }}>{t('editor.evalOrder', '평가 순서')} ({macroCount} MACRO): </span>
          {order.map((n, i) => (
            <span key={n} className="code" style={{ marginRight: 3, fontWeight: deps[n].length ? 700 : 400 }}>{i + 1}.{n}</span>
          ))}
        </div>
        {cyclic.length ? (
          <div data-cycle-warning style={{ color: 'var(--err)', fontWeight: 700 }}>
            ⚠ {t('editor.cycleWarn', '순환 참조 — 잘못된 자료 추출 위험 (슬라이드 67)')}: {cyclic.join(' ↔ ')}
          </div>
        ) : null}
        {Object.entries(deps).filter(([, r]) => r.length).map(([k, r]) => (
          <div key={k} style={{ fontSize: 9.5, color: cyclic.includes(k) ? 'var(--err)' : 'var(--txt-mute)' }}>
            {k} ← {r.join(', ')}
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'var(--txt-mute)' }}>{t('editor.priorityNote', '참조는 수식 토큰 휴리스틱 — Table 열 인자 동명 라벨 포함 가능')}</div>
      </div>
    </GroupBox>
  )
}
