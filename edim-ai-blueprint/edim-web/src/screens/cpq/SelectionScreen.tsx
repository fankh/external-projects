/** C-1 CPQ 제품 선정 (W-02 / 디자인시안 b03) —
 *  조회밴드 F8 · 구성 캔버스+커맨드 라인 · 슬롯 선택 → BOM 재전개 · EDIM Run F9. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { c1Service, cadService, codeService, type CadDocument } from '../../api/services'
import type { BomItem, CanvasBlock } from '../../api/types'
import { CadSvg } from '../../components/CadSvg'
import { AHU_BLOCKS, DEFAULT_SLOT_VALUES, PRODUCT_SLOTS } from '../../api/mock/data'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { CommandLine, Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

let runTabSeq = 1

export function SelectionScreen({ active }: ScreenProps) {
  const shell = useShell()
  // 데이터 로더 의존성은 안정 함수만 사용 — shell 객체 자체는 statusMsg 변경마다
  // identity 가 바뀌어 재조회 루프를 유발한다 (2026-07-09 tech-data 폭주 수정)
  const { setStatusMsg, openTab } = shell
  const { t } = useI18n()
  const [arrangement, setArrangement] = useState('Double Deck 2')
  const [airflow, setAirflow] = useState('11')
  const [pressure, setPressure] = useState('111')
  const [slotValues, setSlotValues] = useState<Record<string, string>>(DEFAULT_SLOT_VALUES)
  const [finished, setFinished] = useState<string>('')
  const [bom, setBom] = useState<BomItem[]>([])
  const [busy, setBusy] = useState(false)
  const [selBlock, setSelBlock] = useState<CanvasBlock | null>(AHU_BLOCKS[2])
  const [selBom, setSelBom] = useState<string | null>(null)
  const [cmdEcho, setCmdEcho] = useState('기준점 지정 >')
  const specInput = useRef<HTMLInputElement>(null)
  // CAD 모드 — 구성도의 정본은 서버 작도 DXF (INT-04)
  const [cadMode, setCadMode] = useState(false)
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(null)
  const [cadOffline, setCadOffline] = useState(false)

  const toggleCad = () => {
    const next = !cadMode
    setCadMode(next)
    if (next && cadDoc === null && !cadOffline) {
      void cadService.arrangement().then((d) => {
        if (d === null) setCadOffline(true)
        else {
          setCadDoc(d)
          setStatusMsg(`구성도 CAD — 엔티티 ${d.entities.length} (ezdxf 작도, DXF 다운로드 가능)`)
        }
      })
    }
  }

  const apply = useCallback(async (sv: Record<string, string>) => {
    setBusy(true)
    try {
      const r = await codeService.expand(sv)
      setFinished(r.finishedGoodsCode)
      setBom(r.items)
      setStatusMsg(`BOM 재전개 ${r.items.length}항목 (구성 블록 ${AHU_BLOCKS.length})`)
    } finally {
      setBusy(false)
    }
  }, [setStatusMsg])

  useEffect(() => { void apply(DEFAULT_SLOT_VALUES) }, [apply])

  const startRun = useCallback(() => {
    const n = runTabSeq++
    openTab({
      id: `cpq-run:${n}`, screenId: 'cpq-run',
      code: 'Run', title: `실행 #${n}`,
    })
  }, [openTab])

  useFKeys(active, useMemo(() => ({
    F2: () => {
      // 신규 견적 — 슬롯 선택 초기화 후 재전개
      setSlotValues(DEFAULT_SLOT_VALUES)
      void apply(DEFAULT_SLOT_VALUES)
      setStatusMsg('신규 견적 — 슬롯 선택 초기화 (기본 KOF)')
    },
    F8: () => { void apply(slotValues) },
    F9: startRun,
    F12: () => setStatusMsg(`견적 저장 — ${finished || 'KDP 1-21-13-15'} · BOM ${bom.length}항목 (cpq_selection_item 은 Run 시 영속)`),
  }), [apply, slotValues, startRun, finished, bom.length, setStatusMsg]))

  const setSlot = (slot: string, v: string) => {
    const next = { ...slotValues, [slot]: v }
    setSlotValues(next)
    void apply(next)   // 슬롯 변경 = 즉시 재전개 (CPQ-004)
  }

  // 사양 Excel Import (CPQ-002) — Slot·Value 2열 → 슬롯 자동 세팅 + 재전개
  const importSpec = (f: globalThis.File) => {
    void (async () => {
      try {
        const sv = await c1Service.specImport(f)
        if (!sv) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>사양 Import 불가 — 백엔드 연결 필요</span>)
          return
        }
        const next = { ...slotValues, ...sv }
        setSlotValues(next)
        await apply(next)
        setStatusMsg(`사양 Import ✓ — 슬롯 ${Object.keys(sv).length}건 반영 (${Object.entries(sv).map(([k, v]) => `${k}=${v}`).join(' · ')})`)
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : 'Import 실패'}</span>)
      }
    })()
  }

  // 견적 미리보기 — Run 없이 현재 슬롯으로 견적서 PDF 즉석 렌더
  const quotePreview = () => {
    void c1Service.quotePreviewPdf(slotValues)
      .then((url) => {
        if (url) {
          window.open(url, '_blank')
          setStatusMsg('견적 미리보기 ✓ — 현재 슬롯 BOM·단가 실렌더 (영속 없음)')
        } else {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>미리보기 불가 — 백엔드 연결 필요</span>)
        }
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  // CommandLine 실명령 — ZOOM [IN|OUT] · FIT · MEASURE · SELECT <code> · RUN
  const runCommand = (raw: string) => {
    const [cmd, ...rest] = raw.trim().split(/\s+/)
    const arg = rest.join(' ')
    const c = (cmd ?? '').toUpperCase()
    const cad = (action: string) => {
      if (!cadMode) toggleCad()
      window.dispatchEvent(new CustomEvent('edim-cad-cmd', { detail: { action } }))
    }
    if (c === 'ZOOM') {
      cad(arg.toUpperCase() === 'OUT' ? 'zoom-out' : 'zoom-in')
      setStatusMsg(`ZOOM ${arg.toUpperCase() === 'OUT' ? 'OUT' : 'IN'} — CAD 캔버스`)
    } else if (c === 'FIT') {
      cad('fit')
      setStatusMsg('FIT — 도면 맞춤')
    } else if (c === 'MEASURE') {
      cad('measure')
      setStatusMsg('MEASURE — 두 점 클릭 = 거리 (끝점/중심 스냅)')
    } else if (c === 'RUN') {
      startRun()
    } else if (c === 'SELECT' && arg) {
      const hit = bom.find((b) => b.resolvedCode.toUpperCase().includes(arg.toUpperCase()))
      if (hit) {
        setSelBom(hit.resolvedCode)
        setStatusMsg(`SELECT — ${hit.resolvedCode} (${hit.name})`)
      } else {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>SELECT — BOM 에 없음: {arg}</span>)
      }
    } else {
      setStatusMsg('명령: ZOOM [IN|OUT] · FIT · MEASURE · SELECT <code> · RUN')
    }
    setCmdEcho(`${raw} ✓ >`)
  }

  const totalK = bom.reduce((s, b) => s + (b.priceK ?? 0) * b.quantity, 0)

  const cols: GridColumn<BomItem>[] = [
    { key: 'lv', header: 'Lv', width: 24, align: 'center', render: (r) => r.level },
    { key: 'code', header: 'Code', code: true, render: (r) => r.resolvedCode },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'qty', header: t('cpq.qty', '수량'), width: 30, align: 'right', render: (r) => r.quantity },
    {
      key: 'amt', header: t('cpq.amount', '금액(K)'), width: 62, align: 'right',
      render: (r) => (r.priceK == null ? '—' : (r.priceK * r.quantity).toLocaleString()),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project<i>*</i></label>
        <Combo width={120} value={shell.activeProject?.name ?? 'Micron #7'}
          options={[shell.activeProject?.name ?? 'Micron #7']} />
        <label>Arrangement</label>
        <Combo width={140} value={arrangement} options={['Double Deck 2', 'Single Deck', 'Return Top']}
          onChange={setArrangement} />
        <label>{t('cpq.airflow', '풍량')}<i>*</i></label>
        <input className="in req" style={{ width: 56 }} value={airflow} aria-label="풍량"
          onChange={(e) => setAirflow(e.target.value)} />
        <span className="unit">CMM</span>
        <label>{t('cpq.pressure', '정압')}<i>*</i></label>
        <input className="in req" style={{ width: 56 }} value={pressure} aria-label="정압"
          onChange={(e) => setPressure(e.target.value)} />
        <span className="unit">mmAq</span>
        <span style={{ flex: 1 }} />
        <input ref={specInput} type="file" accept=".xlsx" style={{ display: 'none' }}
          aria-label="사양 Excel"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importSpec(f)
            e.target.value = ''
          }} />
        <Btn onClick={() => specInput.current?.click()}>{t('cpq.specExcel', '사양 Excel ⬆')}</Btn>
        <Btn variant="pri" disabled={busy} onClick={() => void apply(slotValues)}>
          {busy ? '…' : t('cpq.applyF8', '적용 F8')}
        </Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1.2, padding: 6 }}>
          <div style={{ display: 'flex', gap: 3, paddingBottom: 4, alignItems: 'center' }}>
            <Btn variant={cadMode ? 'default' : 'pri'} onClick={() => cadMode && toggleCad()}>구성도</Btn>
            <Btn variant={cadMode ? 'pri' : 'default'} onClick={() => !cadMode && toggleCad()}>CAD</Btn>
            <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
              {cadMode ? 'ezdxf 실도면 (레이어: ARRANGEMENT·LABEL·DIM)' : '대화형 구성 — Block 선택·이동'}
            </span>
            <span style={{ flex: 1 }} />
            <Btn onClick={() => {
              void cadService.arrangementDxf()
                .then(() => setStatusMsg('구성도 DXF 다운로드 — CAD 호환 (R2010)'))
                .catch((e: Error) => setStatusMsg(
                  <span style={{ color: 'var(--err)' }}>{e.message}</span>))
            }}>⬇ DXF</Btn>
          </div>
          {cadMode ? (
            <div style={{ flex: 1, minHeight: 250, border: '1px solid var(--line)', background: '#fff' }}>
              {cadDoc ? (
                <CadSvg doc={cadDoc} />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>
                  {cadOffline ? 'CAD 작도는 백엔드가 필요합니다 (MOCK 모드)' : '작도 중…'}
                </div>
              )}
            </div>
          ) : (
            <Cvs blocks={AHU_BLOCKS} selectedId={selBlock?.id ?? null}
              onSelect={setSelBlock}
              dims={[{ x: 36, y: 10, w: 430, label: '4,504' }]}
              labels={[{ x: 472, y: 34, text: '3,254' }]}
              style={{ flex: 1, minHeight: 250 }} />
          )}
          <CommandLine
            prompt={selBlock ? `MOVE 선택=${selBlock.name}  ${cmdEcho}` : '명령 대기 >'}
            coord="X 2,140.5  Y 386.0 | 스냅 ON"
            onCommand={runCommand} />
        </div>
        <div className="split-h" />
        <div style={{ width: 378, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('cpq.finishedCode', '완성품 Code')} right={<Chip tone="ok">유효</Chip>}>
            <div style={{
              fontFamily: 'Consolas, monospace', fontSize: 11,
              color: 'var(--title-navy)', background: 'var(--req-yellow)', padding: '3px 6px',
            }}>
              {finished || '—'}
            </div>
          </GroupBox>
          <GroupBox title={t('cpq.slotSpec', '선택 사양 (Slot)')}>
            <div className="frm c2">
              {PRODUCT_SLOTS.map((s) => (
                <SlotRow key={s.slot} slot={s.slot} label={s.label}
                  values={s.values} value={slotValues[s.slot] ?? ''} onChange={setSlot} />
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('cpq.bomTitle', 'BOM · 실시간 가격')} style={{ flex: 1 }} noPad
            right={<span className="b" style={{ height: 18, fontSize: 10 }}>전체 {AHU_BLOCKS.length}</span>}>
            <DenseGrid columns={cols} rows={bom}
              rowKey={(r) => r.resolvedCode}
              selectedKey={selBom}
              onRowClick={(r) => setSelBom(r.resolvedCode)}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.resolvedCode}`, screenId: 'code-detail',
                code: '상세', title: r.resolvedCode,
                params: { code: r.resolvedCode, name: r.name },
              })}
              footer={<>
                <td colSpan={4}>{t('common.total', '합계')} (47)</td>
                <td className="num">{totalK.toLocaleString()}</td>
              </>} />
          </GroupBox>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn style={{ flex: 1, justifyContent: 'center' }} onClick={quotePreview}>{t('cpq.quotePreview', '견적 미리보기')}</Btn>
            <Btn variant="run" style={{ flex: 1.4, justifyContent: 'center' }} onClick={startRun}>
              ▶ EDIM Run F9
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function SlotRow(props: {
  slot: string; label: string; values: string[]; value: string
  onChange: (slot: string, v: string) => void
}) {
  return (
    <>
      <label>{props.slot} · {props.label}</label>
      <Combo value={props.value} options={props.values}
        onChange={(v) => props.onChange(props.slot, v)} />
    </>
  )
}
