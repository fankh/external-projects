/** S-4-1-1 PLM Design Editor (W-06) — CAD 툴바 · Block 캔버스 · 치수 Macro/Variant ·
 *  Coding Run(파라메트릭 재계산 mock) · 커맨드 라인. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasBlock, DimensionDef } from '../../api/types'
import { DWG_BLOCKS, DWG_DIMS, MACRO_CODING } from '../../api/mock/data'
import { approvalService, cadService, drawingService, macroService, type CadDocument } from '../../api/services'
import { CadSvg } from '../../components/CadSvg'
import { Btn, Chip, Combo, Fx, GroupBox, Sep } from '../../components/controls'
import { CommandLine, Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const CAD_TOOLS = ['복사 CO', '이동', '반전', '연장', '삭제 E', '회전 RO', '자르기 TR', 'Block REG', '치수 DI', '특성 CH']

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
    { key: 'kind', header: '구분', width: 50, align: 'center', render: (r) => r.kind },
  ]

  return (
    <div className="fill-col">
      <div className="toolbar">
        <span className="b ic" title="실행 취소">↶</span>
        <span className="b ic" title="다시 실행">↷</span>
        <Sep />
        {CAD_TOOLS.map((t) => (
          <Btn key={t} variant={tool === t ? 'pri' : 'default'} onClick={() => setTool(t)}>{t}</Btn>
        ))}
        <Sep />
        <Combo width={150} value="Snap: 끝점·중앙·중심" options={['Snap: 끝점·중앙·중심', 'Snap: OFF']} />
        <Btn>Simulation</Btn>
        <Sep />
        <input ref={cadInput} type="file" accept=".dxf,.dwg" style={{ display: 'none' }}
          aria-label="CAD 파일"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importCad(f)
            e.target.value = ''
          }} />
        <Btn onClick={() => cadInput.current?.click()}>DXF 열기</Btn>
        <Btn onClick={exportCad}>DXF 내보내기</Btn>
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
                  {cadOffline ? 'CAD 작도는 백엔드가 필요합니다 (MOCK 모드)' : '작도 중…'}
                </div>
              )}
            </div>
          ) : (
            <Cvs blocks={DWG_BLOCKS} selectedId={selBlock?.id ?? null} onSelect={setSelBlock}
              onOpen={(b) => shell.openTab({
                id: `part-detail:${b.id}`, screenId: 'part-detail',
                code: '부품', title: b.name, params: { partId: b.id },
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
                Block 더블클릭 = 부품 정보 상세
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
            <span style={{ color: '#e0a400' }}>● 검증 Macro</span>
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
          <GroupBox title="Design Rule — 치수 Set-up" noPad
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>더블클릭 = 편집</span>}>
            <DenseGrid columns={ruleCols} rows={dims} rowKey={(r) => r.no} />
          </GroupBox>
          <GroupBox title="Coding" right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={runMacro}>Run F9</Btn>
          }>
            <Fx>{MACRO_CODING}</Fx>
            <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 3 }}>
              EDIM Macro 호출 → 계산식 표시·직접 입력 가능
              {evaluated ? <Chip tone="ok">평가 ✓</Chip> : null}
            </div>
          </GroupBox>
          <GroupBox title="Part relationship set-up">
            <div className="frm c2">
              <label>A</label><Combo value="Casing" options={['Casing', 'Impeller', 'Shaft']} />
              <label>B</label><Combo value="Impeller" options={['Casing', 'Impeller', 'Shaft']} />
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.7, marginTop: 4, color: 'var(--txt-dim)' }}>
              조건1: 수직·수평·중심·중앙 / 조건2: 접촉(면·선·점)·좌표·각도<br />
              관계값: <span className="fx" style={{ display: 'inline', padding: '1px 6px' }}>=A2.Table23_3*Var32_2</span><br />
              우선순위: A/B ① → B/C ② (순환 자동 점검)
            </div>
          </GroupBox>
          <GroupBox title="Sub Item DWG · 조립순서">
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              ① Bearing · ② Shaft · ③ Inlet-Cone R<br />
              ④ Inlet-Cone L · ⑤ Impeller <Chip tone="info">◆ 조립순서</Chip>
            </div>
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
