/** S-4-1-1 PLM Design Editor (W-06) — CAD 툴바 · Block 캔버스 · 치수 Macro/Variant ·
 *  Coding Run(파라메트릭 재계산 mock) · 커맨드 라인. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasBlock, DimensionDef } from '../../api/types'
import { DWG_BLOCKS, DWG_DIMS, MACRO_CODING } from '../../api/mock/data'
import {
  approvalService, cadService, drawingLedgerService, drawingService, macroService, partService,
  type BomRow, type CadDocument, type DwgRelationRow,
} from '../../api/services'
import { CadSvg } from '../../components/CadSvg'
import { Btn, Chip, Combo, Fx, GroupBox, Sep } from '../../components/controls'
import { CommandLine, Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useEditHistory } from '../../shell/useEditHistory'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

// 툴 식별자(내부 값) — 표시 텍스트는 컴포넌트 내 toolLabels 로 번역
const CAD_TOOLS = ['복사 CO', '이동', '반전', '연장', '삭제 E', '회전 RO', '자르기 TR', 'Block REG', '치수 DI', '특성 CH']

/** B16 DWG-024 — Simulation(What-if) 판넬: VARIANT 치수 변경 → MACRO 치수 즉시 재평가 (저장 없음). */
function SimulationPanel(props: {
  dims: DimensionDef[]
  onApply: (next: DimensionDef[]) => void
}) {
  const { t } = useI18n()
  const [vars, setVars] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [live, setLive] = useState(true)
  const variantDims = props.dims.filter((d) => !d.value.trim().startsWith('='))
  const macroDims = props.dims.filter((d) => d.value.trim().startsWith('='))

  // 입력 디바운스 → MACRO 식 전부 엔진 재평가 (미리보기 전용, dims 커밋 없음)
  useEffect(() => {
    if (!Object.keys(vars).length) { setPreview(null); return }
    const timer = setTimeout(() => {
      void (async () => {
        const nums: Record<string, number> = {}
        for (const d of variantDims) {
          const raw = vars[d.no] ?? d.value
          const n = Number(raw)
          if (!Number.isNaN(n)) nums[d.no] = n
        }
        const out: Record<string, number> = {}
        for (const d of macroDims) {
          const r = await macroService.evaluate(d.value, nums)
          if (r === null) { setLive(false); setPreview(null); return }
          if (r.ok && r.value != null) {
            nums[d.no] = r.value
            out[d.no] = r.value
          }
        }
        setLive(true)
        setPreview(out)
      })()
    }, 400)
    return () => clearTimeout(timer)
  }, [vars]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!preview) return
    props.onApply(props.dims.map((d) => {
      if (vars[d.no] !== undefined && !Number.isNaN(Number(vars[d.no]))) {
        return { ...d, value: vars[d.no] }
      }
      if (preview[d.no] !== undefined) return { ...d, value: String(preview[d.no]) }
      return d
    }))
    setVars({})
    setPreview(null)
  }

  return (
    <GroupBox title={t('editor.simPanel', 'Simulation')} noPad
      right={live
        ? <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>ENG-01</span>
        : <Chip tone="warn">MOCK</Chip>}>
      <div data-sim-panel style={{ padding: 6 }}>
        <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginBottom: 4 }}>
          {t('editor.simHint', 'VARIANT 치수 변경 — MACRO 치수 즉시 재평가 (저장 없음)')}
        </div>
        <div className="frm c2">
          {variantDims.map((d) => (
            <span key={d.no} style={{ display: 'contents' }}>
              <label>{d.no}</label>
              <input className="in" style={{ width: 70 }} value={vars[d.no] ?? d.value}
                aria-label={`Sim ${d.no}`}
                onChange={(e) => setVars((cur) => ({ ...cur, [d.no]: e.target.value }))} />
            </span>
          ))}
        </div>
        {preview ? (
          <div style={{ marginTop: 4, fontSize: 11 }}>
            {macroDims.map((d) => {
              const cur = Number(d.value)
              const nv = preview[d.no]
              if (nv === undefined) return null
              const changed = !Number.isNaN(cur) && Math.abs(nv - cur) > 1e-9
              return (
                <div key={d.no} style={{ display: 'flex', gap: 6 }}>
                  <b style={{ width: 18 }}>{d.no}</b>
                  <span data-sim-val={d.no} style={{ color: changed ? 'var(--title-navy)' : undefined }}>
                    {nv}{changed && !Number.isNaN(cur) ? ` (Δ ${nv - cur > 0 ? '+' : ''}${Math.round((nv - cur) * 100) / 100})` : ''}
                  </span>
                </div>
              )
            })}
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Btn variant="pri" onClick={apply}>{t('editor.simApply', '적용 (치수 반영)')}</Btn>
            </div>
          </div>
        ) : null}
      </div>
    </GroupBox>
  )
}


/** =A+56, =A*1.62 형태의 Macro 를 A 값 기준으로 평가 (mock — ENG-01) */
function evalDims(dims: DimensionDef[]): DimensionDef[] {
  const a = Number(dims.find((d) => d.no === 'A')?.value) || 0
  return dims.map((d) => {
    if (d.no === 'B') return { ...d, value: String(a + 56) }
    if (d.no === 'K') return { ...d, value: String(Math.round(a * 1.62)) }
    return d
  })
}

export function DesignEditorScreen({ active, tab }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  // CAD 툴 표시 라벨 — 내부 값(tool 상태·명령 프롬프트)은 한글 원문 유지
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
  const [selBlock, setSelBlock] = useState<CanvasBlock | null>(DWG_BLOCKS[1])
  const [dims, setDims] = useState<DimensionDef[]>(DWG_DIMS)
  const [editingNo, setEditingNo] = useState<string | null>(null)
  const [coord, setCoord] = useState('X 0.0  Y 0.0')
  const [evaluated, setEvaluated] = useState(false)
  const cadInput = useRef<HTMLInputElement>(null)
  // CAD 모드 (기본) — 부품도의 정본은 서버 작도 DXF (Run 제작도면과 동일 geometry)
  const [cadMode, setCadMode] = useState(true)
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(null)
  const [cadOffline, setCadOffline] = useState(false)
  // B16 — Block 캔버스·부품 관계 실데이터 (dwg_document·dwg_part_relation, 불가 시 mock)
  const [blocks, setBlocks] = useState<CanvasBlock[]>(DWG_BLOCKS)
  const [relations, setRelations] = useState<DwgRelationRow[] | null>(null)
  // B17 — 조립순서 = dwg_bom 실데이터
  const [bom, setBom] = useState<BomRow[] | null>(null)

  // 치수 편집 이력 (B12) — undo/redo 시 CAD 재작도
  const hist = useEditHistory(active, dims, setDims, (kind, v) => {
    if (cadMode) loadCad(v)
    shell.setStatusMsg(`${kind === 'undo' ? '실행 취소' : '다시 실행'} — 치수 이력 (A=${v.find((d) => d.no === 'A')?.value ?? '?'})`)
  })

  const numericDims = (src: DimensionDef[]): Record<string, number> => {
    const vars: Record<string, number> = {}
    for (const d of src) {
      const n = Number(d.value)
      if (!Number.isNaN(n)) vars[d.no] = n
    }
    return vars
  }

  const loadCad = (src: DimensionDef[]) => {
    void cadService.partDrawing(numericDims(src)).then((d) => {
      if (d === null) {
        // 백엔드 불가 → 편집(모의) 캔버스로 폴백
        setCadOffline(true)
        setCadMode(false)
        shell.setStatusMsg('CAD 작도는 백엔드가 필요합니다 — 편집(모의) 캔버스 표시 (MOCK 모드)')
      } else {
        setCadDoc(d)
        shell.setStatusMsg(`부품도 CAD — 엔티티 ${d.entities.length} (Run 제작도면과 동일 정본)`)
      }
    })
  }

  // 최초 진입 — 치수 정의를 실DB(dwg_dimension)에서 로드 후 CAD 작도 (기본 모드 = CAD)
  useEffect(() => {
    void (async () => {
      const d = await drawingService.dimensions()
      const src = d && d.length ? d : dims   // 백엔드 불가 시 mock 폴백
      if (d && d.length) setDims(d)
      loadCad(src)
    })()
    // Block 목록 = dwg_document 실데이터 (B16) — 편집 캔버스·부품 정보 진입에 사용
    void drawingLedgerService.blocks('KDCR 3-13').then((bs) => {
      if (bs && bs.length) {
        setBlocks(bs.map((b) => ({
          id: `blk:${b.documentId}`, name: b.blockName, sub: b.content.sub,
          x: b.content.x, y: b.content.y, w: b.content.w, h: b.content.h,
          dashed: b.content.dashed,
        })))
      }
    })
    void drawingLedgerService.relations('KDCR 3-13').then(setRelations)
    void partService.bom('KDCR 3-13').then(setBom)   // 조립순서 ◆ (B17)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCad = () => {
    const next = !cadMode
    setCadMode(next)
    if (next && cadDoc === null && !cadOffline) loadCad(dims)
  }

  const importCad = (f: globalThis.File) => {
    void (async () => {
      try {
        const r = await cadService.importFile(f, 'PS-61313-5')
        if (r === null) {
          shell.setStatusMsg('CAD Import — 백엔드 불가 (mock 모드)')
          return
        }
        shell.openTab({
          id: `cad-viewer:${r.fileId}`, screenId: 'cad-viewer',
          code: 'CAD', title: f.name.slice(0, 16),
          params: { fileId: r.fileId, name: f.name, from: tab.id },
        })
        shell.setStatusMsg(
          `CAD Import ✓ — ${f.name} (엔티티 ${r.document.entities.length}, Folder/DWG 등록)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : 'Import 실패'}</span>)
      }
    })()
  }

  const exportCad = () => {
    const vars: Record<string, number> = {}
    for (const d of dims) {
      const n = Number(d.value)
      if (!Number.isNaN(n)) vars[d.no] = n
    }
    void cadService.exportDxf(vars)
      .then(() => shell.setStatusMsg('DXF 내보내기 — 현재 치수 반영 (ezdxf R2010)'))
      .catch((e: Error) => shell.setStatusMsg(
        <span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const runMacro = () => {
    void (async () => {
      // 수치 치수를 변수로 — Macro 바인딩(=식)을 엔진으로 평가 (ENG-01)
      const vars: Record<string, number> = {}
      for (const d of dims) {
        const n = Number(d.value)
        if (!Number.isNaN(n)) vars[d.no] = n
      }
      const macroDims = dims.filter((d) => d.value.trim().startsWith('='))
      const next = [...dims]
      let live = true
      for (const d of macroDims) {
        const r = await macroService.evaluate(d.value, vars)
        if (r === null) { live = false; break }
        if (r.ok && r.value != null) {
          vars[d.no] = r.value
          const idx = next.findIndex((x) => x.no === d.no)
          next[idx] = { ...next[idx], value: String(r.value) }
        } else {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>치수 {d.no} — {r.error}</span>)
          return
        }
      }
      if (live) {
        hist.push()   // Run 전 상태 스냅샷 — Ctrl+Z 로 평가 전으로 복귀
        setDims(next)
        setEvaluated(true)
        if (cadMode) loadCad(next)   // CAD 모드 — 평가 치수로 도면 재작도
        shell.setStatusMsg(`Macro 평가 ${macroDims.length}식 ✓ (ENG-01 실평가) — 파라메트릭 반영 (DWG-007)`)
      } else {
        setDims(evalDims)   // mock 폴백
        setEvaluated(true)
        shell.setStatusMsg('Macro 평가 (mock) — 파라메트릭 반영')
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F8: () => {
      // 조회 = 현재 치수로 CAD 재작도 (서버 도면 갱신)
      if (!cadMode) setCadMode(true)
      loadCad(dims)
    },
    F9: runMacro,
    F12: () => {
      void drawingService.saveDimensions(dims).then((r) => shell.setStatusMsg(r
        ? `임시저장 ✓ — VARIANT ${r.variantSaved}건 · Macro 식 ${r.macroSaved}건 (dwg_dimension/tbx_macro)`
        : <span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>))
    },
  }), [dims, cadMode, shell.setStatusMsg])) // eslint-disable-line react-hooks/exhaustive-deps

  const dimA = dims.find((d) => d.no === 'A')?.value ?? '670'
  const dimB = dims.find((d) => d.no === 'B')?.value ?? '=A+56'
  const dimK = dims.find((d) => d.no === 'K')?.value ?? '—'

  const ruleCols: GridColumn<DimensionDef>[] = [
    { key: 'no', header: 'No.', width: 28, align: 'center', render: (r) => <b>{r.no}</b> },
    {
      key: 'val', header: 'Dim.', width: 76, align: 'right',
      render: (r) => (editingNo === r.no
        ? (
          <input autoFocus className="in" style={{ width: '100%', height: 20 }} defaultValue={r.value}
            aria-label={`치수 ${r.no}`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              hist.push()   // 편집 이력 (B12)
              setDims((prev) => prev.map((d) => (d.no === r.no ? { ...d, value: v } : d)))
              setEditingNo(null)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        )
        : <span onDoubleClick={() => setEditingNo(r.no)}>{r.value}</span>),
    },
    {
      key: 'bind', header: 'Set-up', width: 64, align: 'center',
      render: (r) => <Chip tone={r.binding === 'MACRO' ? 'info' : 'ok'}>{r.binding}</Chip>,
    },
    { key: 'kind', header: t('editor.kindCol', '구분'), width: 50, align: 'center', render: (r) => r.kind },
  ]

  return (
    <div className="fill-col">
      <div className="toolbar">
        <span className="b ic" title="실행 취소 (Ctrl+Z)"
          onClick={() => window.dispatchEvent(new CustomEvent('edim-undo'))}>↶</span>
        <span className="b ic" title="다시 실행 (Ctrl+Y)"
          onClick={() => window.dispatchEvent(new CustomEvent('edim-redo'))}>↷</span>
        <Sep />
        {CAD_TOOLS.map((tl) => (
          <Btn key={tl} variant={tool === tl ? 'pri' : 'default'} onClick={() => setTool(tl)}>
            {toolLabels[tl] ?? tl}
          </Btn>
        ))}
        <Sep />
        <Combo width={150} value="Snap: 끝점·중앙·중심"
          options={[
            { value: 'Snap: 끝점·중앙·중심', label: t('editor.snapOn', 'Snap: 끝점·중앙·중심') },
            'Snap: OFF',
          ]} />
        <Btn onClick={() => {
          // Simulation = 전체 Macro 재평가 + CAD 재작도 시퀀스 (B10)
          if (!cadMode) setCadMode(true)
          shell.setStatusMsg('Simulation — 전체 Macro 재평가 → CAD 재작도 (F9 시퀀스)')
          setTimeout(() => window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'F9', cancelable: true })), 60)
        }}>Simulation</Btn>
        <Sep />
        <input ref={cadInput} type="file" accept=".dxf,.dwg" style={{ display: 'none' }}
          aria-label="CAD 파일"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importCad(f)
            e.target.value = ''
          }} />
        <Btn onClick={() => cadInput.current?.click()}>{t('editor.openDxf', 'DXF 열기')}</Btn>
        <Btn onClick={exportCad}>{t('editor.exportDxf', 'DXF 내보내기')}</Btn>
        <Sep />
        <Btn variant={cadMode ? 'default' : 'pri'} onClick={() => cadMode && toggleCad()}>{t('common.edit', '편집')}</Btn>
        <Btn variant={cadMode ? 'pri' : 'default'} onClick={() => !cadMode && toggleCad()}>CAD</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1, padding: 6 }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setCoord(`X ${(e.clientX - r.left).toFixed(1)}  Y ${(e.clientY - r.top).toFixed(1)}`)
          }}>
          {cadMode ? (
            <div style={{ flex: 1, minHeight: 320, border: '1px solid var(--line)', background: '#fff' }}>
              {cadDoc ? (
                <CadSvg doc={cadDoc} />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>
                  {cadOffline
                    ? t('editor.cadNeedsBackend', 'CAD 작도는 백엔드가 필요합니다 (MOCK 모드)')
                    : t('editor.drawing', '작도 중…')}
                </div>
              )}
            </div>
          ) : (
            <Cvs blocks={blocks} selectedId={selBlock?.id ?? null} onSelect={setSelBlock}
              onOpen={(b) => shell.openTab({
                id: `part-detail:${b.id}`, screenId: 'part-detail',
                code: '부품', title: b.name, params: { partId: b.id, name: b.name },
              })}
              dims={[
                { x: 150, y: 16, w: 330, label: `B = ${dimB}` },
                { x: 200, y: 34, w: 180, label: `A = ${dimA}` },
                { x: 80, y: 292, w: 440, label: `K = ${dimK}` },
              ]}
              labels={[
                { x: 130, y: 64, text: 'C' }, { x: 460, y: 64, text: 'C' },
                { x: 70, y: 120, text: 'G' }, { x: 512, y: 120, text: 'G' },
                { x: 220, y: 250, text: 'D' }, { x: 390, y: 250, text: 'D' },
                { x: 300, y: 264, text: 'E' }, { x: 530, y: 180, text: 'F' },
              ]}
              style={{ flex: 1, minHeight: 320 }}>
              <div style={{ position: 'absolute', left: 236, top: 116, fontSize: 9, color: 'var(--txt-dim)' }}>
                {t('editor.blockDblHint', 'Block 더블클릭 = 부품 정보 상세')}
              </div>
            </Cvs>
          )}
          <CommandLine
            prompt={selBlock ? `${tool.split(' ')[0].toUpperCase()} 선택=${selBlock.name}  기준점 지정 >` : '명령 대기 >'}
            coord={`${coord} | 스냅 ON`}
            onCommand={(cmd) => shell.setStatusMsg(`명령 실행: ${cmd}`)} />
          <div style={{ display: 'flex', gap: 8, padding: '4px 2px', fontSize: 10, color: 'var(--txt-dim)', flexWrap: 'wrap' }}>
            <span>● Key Dimension</span><span style={{ color: '#74a9d8' }}>● Detail Dimension</span>
            <span style={{ color: '#2e8b57' }}>● Arrangement</span>
            <span style={{ color: '#e0a400' }}>● {t('editor.verifyMacro', '검증 Macro')}</span>
            <span>◆ Assembling Seq · QC/Material/Mfg</span>
          </div>
        </div>
        <div className="split-h" />
        <div style={{ width: 312, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title="Code">
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }}
              value="KDCR 3-13" readOnly aria-label="Code" />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                <span key={s} className="b ic"
                  style={s === 'B' ? { borderColor: 'var(--err)', color: 'var(--err)' } : undefined}>
                  {s}
                </span>
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('editor.designRule', 'Design Rule — 치수 Set-up')} noPad
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('editor.dblEdit', '더블클릭 = 편집')}</span>}>
            <DenseGrid columns={ruleCols} rows={dims} rowKey={(r) => r.no} />
          </GroupBox>
          <GroupBox title="Coding" right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={runMacro}>Run F9</Btn>
          }>
            <Fx>{MACRO_CODING}</Fx>
            <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 3 }}>
              {t('editor.macroHint', 'EDIM Macro 호출 → 계산식 표시·직접 입력 가능')}
              {evaluated ? <Chip tone="ok">{t('editor.evaluated', '평가 ✓')}</Chip> : null}
            </div>
          </GroupBox>
          <GroupBox title="Part relationship set-up" noPad
            right={relations !== null && relations.length
              ? <Chip tone="ok">dwg_part_relation {relations.length}</Chip>
              : <Chip tone="warn">MOCK</Chip>}>
            {relations !== null && relations.length ? (
              <table className="g">
                <thead><tr><th>A / B</th><th>{t('editor.relAlign', '정렬')}</th>
                  <th>{t('editor.relContact', '접촉')}</th><th>Macro</th><th>①</th></tr></thead>
                <tbody>
                  {relations.map((r) => (
                    <tr key={r.relationId}>
                      <td style={{ fontSize: 10 }}>{r.blockA} / {r.blockB}</td>
                      <td className="c">{r.align || '-'}</td>
                      <td className="c">{r.contact || '-'}</td>
                      <td style={{ fontSize: 10 }}>{r.macro ?? '-'}</td>
                      <td className="c">{r.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 10, lineHeight: 1.7, padding: 6, color: 'var(--txt-dim)' }}>
                {t('editor.relCond', '조건1: 수직·수평·중심·중앙 / 조건2: 접촉(면·선·점)·좌표·각도')}<br />
                {t('editor.relValue', '관계값')}: <span className="fx" style={{ display: 'inline', padding: '1px 6px' }}>=A2.Table23_3*Var32_2</span><br />
                {t('editor.relPriority', '우선순위: A/B ① → B/C ② (순환 자동 점검)')}
              </div>
            )}
          </GroupBox>
          <SimulationPanel dims={dims} onApply={(next) => {
            hist.push()
            setDims(next)
            setEvaluated(true)
            if (cadMode) loadCad(next)
            shell.setStatusMsg('Simulation 적용 ✓ — 치수 반영 + CAD 재작도 (DWG-024)')
          }} />
          <GroupBox title={t('editor.subItemDwg', 'Sub Item DWG · 조립순서')}
            right={bom !== null && bom.length
              ? <Chip tone="ok">dwg_bom {bom.length}</Chip>
              : <Chip tone="warn">MOCK</Chip>}>
            {bom !== null && bom.length ? (
              <div data-bom-live style={{ fontSize: 11, lineHeight: 1.9 }}>
                {bom.map((b) => (
                  <div key={b.bomId} title={b.assemblyNote}>
                    {'①②③④⑤⑥⑦⑧⑨'[(b.assemblySeq ?? 9) - 1] ?? '◇'} {b.partName}
                    <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}> ×{b.qty} {b.partNo}</span>
                  </div>
                ))}
                <Chip tone="info">◆ {t('editor.asmSeq', '조립순서')}</Chip>
              </div>
            ) : (
              <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                ① Bearing · ② Shaft · ③ Inlet-Cone R<br />
                ④ Inlet-Cone L · ⑤ Impeller <Chip tone="info">◆ {t('editor.asmSeq', '조립순서')}</Chip>
              </div>
            )}
          </GroupBox>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                void drawingService.saveDimensions(dims).then((r) => shell.setStatusMsg(r
                  ? `임시저장 ✓ — VARIANT ${r.variantSaved}건 · Macro 식 ${r.macroSaved}건 (dwg_dimension/tbx_macro)`
                  : <span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>))
              }}>{t('common.tempSave', '임시저장 F12')}</Btn>
            <Btn variant="pri" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                void approvalService.request('dwg_drawing',
                  `KDCR 3-13 Rev.B 설계 변경 — A=${dims.find((d) => d.no === 'A')?.value ?? '?'}`)
                  .then((ok) => shell.setStatusMsg(ok
                    ? '승인 요청 등록 ✓ — 승인함(M-15-2) · 승인권자 알림 발송 (Design > Check)'
                    : <span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요</span>))
              }}>{t('common.requestApproval', '승인 요청')}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
