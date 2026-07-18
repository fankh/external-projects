'use client'

import { useMemo, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CanvasBlock, CadDocument } from '@/lib/cadTypes'
import { CadSvg } from '@/components/CadSvg'
import { useI18n } from '@/components/I18nProvider'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { CommandLine, Cvs } from '@/components/Cvs'
import { Modal } from '@/components/Modal'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { expand, saveSelection, arrangementCad, specImport, type BomItem, type SelectionRow } from './actions'

const PRODUCT_SLOTS = [
  { slot: 'B', label: 'Size', values: ['13', '21', '32'] },
  { slot: 'C', label: 'Material', values: ['32', '45'] },
  { slot: 'E', label: 'Motor', values: ['15', '21'] },
]
const AHU_BLOCKS: CanvasBlock[] = [
  { id: 'filter', name: 'Filter', sub: 'EFP 55·3EA', x: 36, y: 34, w: 110, h: 100 },
  { id: 'ccoil', name: 'Cooling Coil', sub: 'ECC 55·6R', x: 146, y: 34, w: 110, h: 100 },
  { id: 'sffan', name: 'SF Fan', sub: 'KAD 900 FW', x: 256, y: 34, w: 210, h: 74 },
  { id: 'mixbox', name: 'Mixing Box', sub: 'EMX 55', x: 256, y: 108, w: 210, h: 80 },
  { id: 'hcoil', name: 'Heating Coil', sub: 'EHC 55·2R', x: 36, y: 134, w: 220, h: 54 },
]

export function SelectionView(props: {
  projectNo: string
  initialFinished: string
  initialBom: BomItem[]
  initialSlots: Record<string, string>
  selections: SelectionRow[]
  arrBlocks: CanvasBlock[] | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [slotValues, setSlotValues] = useState<Record<string, string>>(props.initialSlots)
  const [finished, setFinished] = useState(props.initialFinished)
  const [bom, setBom] = useState<BomItem[]>(props.initialBom)
  const [selBlock, setSelBlock] = useState<CanvasBlock | null>(null)
  const [savedSelId, setSavedSelId] = useState<number | null>(null)
  const [cadMode, setCadMode] = useState(false)
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(null)
  const [cadOffline, setCadOffline] = useState(false)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const say = (text: string, err = false) => setStatus({ text, err })
  // U1 — 모듈 드래그 배치(좌표 영속) + 더블클릭 세부선정 (localStorage)
  const [geom, setGeom] = useState<Record<string, { x?: number; y?: number; rot?: number; flip?: boolean }>>({})
  const [blockOpts, setBlockOpts] = useState<Record<string, Record<string, string>>>({})
  const [detailBlock, setDetailBlock] = useState<CanvasBlock | null>(null)
  useEffect(() => {
    try {
      setGeom(JSON.parse(localStorage.getItem('edim-c1-geom') ?? '{}'))
      setBlockOpts(JSON.parse(localStorage.getItem('edim-c1-opts') ?? '{}'))
    } catch { /* corrupt */ }
  }, [])
  const moveBlock = (id: string, x: number, y: number) => {
    setGeom((g) => {
      const next = { ...g, [id]: { ...(g[id] ?? {}), x, y } }
      try { localStorage.setItem('edim-c1-geom', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
    say(`배치 이동 — ${id} → (${x}, ${y})`)
  }
  // U1 2단계 — 회전·반전·스냅 (선택 블록 대상, localStorage 영속)
  const [snapOn, setSnapOn] = useState(true)
  const patchGeom = (id: string, p: Partial<{ x: number; y: number; rot: number; flip: boolean }>) => {
    setGeom((g) => {
      const next = { ...g, [id]: { ...(g[id] ?? {}), ...p } }
      try { localStorage.setItem('edim-c1-geom', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }
  const rotateSel = (deg = 90) => {
    if (!selBlock) { say('회전 — 블록을 먼저 선택하십시오', true); return }
    const cur = (geom[selBlock.id]?.rot ?? 0)
    const rot = ((cur + deg) % 360 + 360) % 360
    patchGeom(selBlock.id, { rot })
    say(`회전 RO — ${selBlock.name} → ${rot}°`)
  }
  const mirrorSel = () => {
    if (!selBlock) { say('반전 — 블록을 먼저 선택하십시오', true); return }
    const flip = !(geom[selBlock.id]?.flip ?? false)
    patchGeom(selBlock.id, { flip })
    say(`반전 MI — ${selBlock.name} ${flip ? '적용' : '해제'}`)
  }
  const resetGeom = () => {
    setGeom({})
    try { localStorage.removeItem('edim-c1-geom') } catch { /* quota */ }
    say('배치 초기화 — 기본 위치·회전 복원')
  }
  const runCommand = (cmd: string) => {
    const c = cmd.trim().toUpperCase()
    const [op, arg] = c.split(/\s+/)
    if (op === 'ROTATE' || op === 'RO') rotateSel(Number(arg) || 90)
    else if (op === 'MIRROR' || op === 'MI') mirrorSel()
    else if (op === 'SNAP') { const on = arg ? arg === 'ON' : !snapOn; setSnapOn(on); say(`스냅 ${on ? 'ON (10px)' : 'OFF'}`) }
    else if (op === 'RESET') resetGeom()
    else say(`명령 실행: ${cmd} (지원: ROTATE [deg] · MIRROR · SNAP ON|OFF · RESET)`)
  }
  const saveOpts = (id: string, opts: Record<string, string>) => {
    setBlockOpts((m) => {
      const next = { ...m, [id]: opts }
      try { localStorage.setItem('edim-c1-opts', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }
  const baseBlocks = props.arrBlocks ?? AHU_BLOCKS
  const blocks = useMemo(() => baseBlocks.map((b) => {
    const g = geom[b.id]
    const o = blockOpts[b.id]
    const summary = o ? Object.values(o).filter(Boolean).slice(0, 2).join('·') : ''
    return { ...b, ...(g ?? {}), sub: summary ? `${b.sub ? b.sub + ' · ' : ''}${summary}` : b.sub }
  }), [baseBlocks, geom, blockOpts])
  const geomTyped: Record<string, { x?: number; y?: number; rot?: number; flip?: boolean }> = geom

  const reExpand = (sv: Record<string, string>) => start(async () => {
    const r = await expand(sv)
    if (r.error) { say(r.error, true); return }
    setFinished(r.result!.finishedGoodsCode); setBom(r.result!.items)
    say(`BOM 재전개 ${r.result!.items.length}항목 (${r.result!.finishedGoodsCode})`)
  })
  const setSlot = (slot: string, v: string) => { const next = { ...slotValues, [slot]: v }; setSlotValues(next); reExpand(next) }
  const toggleCad = () => {
    const next = !cadMode; setCadMode(next)
    if (next && cadDoc === null && !cadOffline) {
      void arrangementCad().then((d) => { if (d === null) setCadOffline(true); else { setCadDoc(d); say(`구성도 CAD — 엔티티 ${d.entities.length} (ezdxf 작도)`) } })
    }
  }
  const save = () => start(async () => {
    const r = await saveSelection(props.projectNo, finished || 'KDCR 3-13-13-15', slotValues)
    if (r.error) { say(r.error, true); return }
    setSavedSelId(r.selectionId!); say(`견적안 저장 ✓ — #${r.selectionId} ${finished} (cpq_selection · Run 대상)`)
  })
  const startRun = () => router.push(savedSelId ? `/cpq/run?selectionId=${savedSelId}` : '/cpq/run')
  const loadSel = (idStr: string) => {
    const sel = props.selections.find((s) => String(s.selectionId) === idStr)
    if (!sel) { setSavedSelId(null); return }
    setSavedSelId(sel.selectionId); setSlotValues(sel.slotValues); reExpand(sel.slotValues)
    say(`견적안 불러오기 — #${sel.selectionId} ${sel.finishedGoodsCode}`)
  }

  const bomCols: GridColumn<BomItem>[] = [
    { key: 'lv', header: 'Lv', width: 30, align: 'center', render: (r) => r.level },
    { key: 'code', header: 'Resolved Code', width: 150, code: true, render: (r) => r.resolvedCode },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'qty', header: "Q'ty", width: 42, align: 'right', sortValue: (r) => r.quantity, render: (r) => r.quantity },
    { key: 'price', header: t('cpq.unitPriceK', '단가(K)'), width: 72, align: 'right', sortValue: (r) => r.priceK ?? -1, render: (r) => r.priceK == null ? <span style={{ color: 'var(--warn)' }}>{t('cpq.unpriced', '미확정')}</span> : r.priceK.toLocaleString() },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ gap: 8 }}>
        <span style={{ fontSize: 11 }}>{t('cpq.finishedCode', '완성품')} <b style={{ fontFamily: 'Consolas, monospace', color: 'var(--title-navy)' }}>{finished || '—'}</b></span>
        {PRODUCT_SLOTS.map((s) => (
          <span key={s.slot} style={{ fontSize: 11 }}>{s.slot}
            <select className="in" value={slotValues[s.slot] ?? ''} onChange={(e) => setSlot(s.slot, e.target.value)} style={{ height: 20, fontSize: 10, marginLeft: 2 }}>
              {s.values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <select className="in" value={savedSelId ?? ''} onChange={(e) => loadSel(e.target.value)} style={{ height: 22, fontSize: 11 }} aria-label={t('cpq.quote', '견적안')}>
          <option value="">{t('cpq.quoteLoad', '견적안 불러오기…')}</option>
          {props.selections.map((s) => <option key={s.selectionId} value={s.selectionId}>#{s.selectionId} {s.finishedGoodsCode}</option>)}
        </select>
        {/* N5b — 사양 Excel Import (Slot·Value → 슬롯 자동 세팅 + 재전개) */}
        <label className="b" style={{ cursor: 'pointer' }} title={t('cpq.specExcelHint', '사양 Excel (Slot·Value 2열)')}>
          {t('cpq.specExcel', '⬆ 사양 Excel')}
          <input type="file" accept=".xlsx" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const fd = new FormData(); fd.append('uploadedFile', f)
              void specImport(fd).then((r) => {
                if (r.error || !r.slotValues) { say(r.error ?? '사양 Import 실패'); return }
                setSlotValues(r.slotValues); reExpand(r.slotValues)
                say(`사양 Import ✓ — ${Object.keys(r.slotValues).length}개 슬롯 적용`)
              })
              e.target.value = ''
            }} />
        </label>
        <Btn onClick={() => {
          // N5b — 견적 미리보기 (Run 없이 현재 슬롯 즉석 렌더)
          void fetch('/api/next/quote-preview', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rootCode: 'KDCR 3-13', slotValues }),
          }).then(async (res) => {
            if (!res.ok) { say(`견적 미리보기 실패 (HTTP ${res.status})`); return }
            const url = URL.createObjectURL(await res.blob())
            window.open(url, '_blank')
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
          })
        }}>{t('cpq.quotePreview', '견적 미리보기')}</Btn>
        <Btn onClick={save}>{t('cpq.quoteSave', '저장 F12')}</Btn>
        <Btn variant="run" onClick={startRun}>Run ▶ F9</Btn>
      </div>
      <DetailSelectModal block={detailBlock} initial={detailBlock ? blockOpts[detailBlock.id] : undefined}
        onClose={() => setDetailBlock(null)}
        onSave={(opts) => { if (detailBlock) { saveOpts(detailBlock.id, opts); say(`세부선정 저장 — ${detailBlock.name}`) } setDetailBlock(null) }} />
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ flex: 1.2, gap: 4 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{t('cpq.arrangement', '구성도 (Arrangement)')}</span>
            <Btn variant={cadMode ? 'default' : 'pri'} onClick={() => cadMode && toggleCad()} style={{ height: 18, fontSize: 9.5 }}>{t('cpq.block', '블록')}</Btn>
            <Btn variant={cadMode ? 'pri' : 'default'} onClick={() => !cadMode && toggleCad()} style={{ height: 18, fontSize: 9.5 }}>CAD</Btn>
            <span className="sep" />
            <Btn onClick={() => rotateSel(90)} title={t('cpq.rotateHint', '선택 블록 90° 회전 (RO)')} style={{ height: 18, fontSize: 9.5 }} data-rotate-btn>⟳ RO</Btn>
            <Btn onClick={mirrorSel} title={t('cpq.mirrorHint', '선택 블록 좌우 반전 (MI)')} style={{ height: 18, fontSize: 9.5 }} data-mirror-btn>⇋ MI</Btn>
            <Btn variant={snapOn ? 'pri' : 'default'} onClick={() => { setSnapOn(!snapOn); say(`스냅 ${!snapOn ? 'ON (10px)' : 'OFF'}`) }} style={{ height: 18, fontSize: 9.5 }} data-snap-btn>SNAP</Btn>
          </div>
          {cadMode ? (
            <div style={{ flex: 1, minHeight: 280, border: '1px solid var(--line)', background: '#fff' }}>
              {cadDoc ? <CadSvg doc={cadDoc} /> : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>{cadOffline ? t('cpq.cadOffline', 'CAD 서버 연결 실패') : t('cpq.drawing', '작도 중…')}</div>}
            </div>
          ) : (
            <Cvs blocks={blocks} selectedId={selBlock?.id ?? null} onSelect={setSelBlock} onOpen={setDetailBlock} onMoveBlock={moveBlock} snap={snapOn ? 10 : 0} style={{ flex: 1, minHeight: 280 }} />
          )}
          <CommandLine prompt={selBlock ? `${t('cpq.cmdSelected', '선택')}=${selBlock.name}  ${t('cpq.cmdBasePoint', '기준점 지정 >')}` : t('cpq.cmdIdle', '명령 대기 >')} coord={snapOn ? t('cpq.snapOn', '스냅 ON') : t('cpq.snapOff', '스냅 OFF')} onCommand={runCommand} />
          {status ? <div style={{ fontSize: 11, color: status.err ? 'var(--err)' : 'var(--run)' }}>{status.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="fill-col" style={{ width: 420, minWidth: 0 }}>
          <GroupBox title={t('cpq.bomExpandTitle', 'BOM 전개 — {n}항목 (재귀 CTE + slot_map)').replace('{n}', String(bom.length))} noPad right={pending ? <Chip tone="info">{t('cpq.expanding', '전개 중…')}</Chip> : <Chip tone="ok">{t('cpq.liveDb', '실 DB')}</Chip>}>
            <div style={{ height: '100%', minHeight: 0 }}>
              <DenseGrid prefKey="next-selection-bom" colFilter columns={bomCols} rows={bom} rowKey={(r, i) => `${r.resolvedCode}-${i}`} emptyText={t('cpq.noExpandItems', '전개 항목 없음')} />
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}

/** U1/U15 — 모듈 더블클릭 세부선정 (슬라이드 7 설계 옵션) — 기술·물성 옵션 콤보. */
const DETAIL_FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: 'material', label: 'Material type', options: ['', 'Carbon Steel', 'SUS304', 'AL'] },
  { key: 'class', label: 'Impeller Class', options: ['', 'CL1', 'CL2', 'CL3'] },
  { key: 'spark', label: 'Spark proof', options: ['', 'none', 'AMCA-A', 'AMCA-B', 'AMCA-C'] },
  { key: 'airflowDev', label: 'Airflow device', options: ['', 'none', 'Airflow', 'IGV'] },
  { key: 'casing', label: 'Casing Type', options: ['', 'Steel S', 'Galvanized', 'SUS'] },
  { key: 'motor', label: 'Motor Type', options: ['', 'TEFC', 'ODP'] },
  { key: 'supplier', label: 'Supplier', options: ['', '효성', 'LG', 'ABB'] },
  { key: 'pole', label: 'Pole', options: ['', '2P', '4P', '6P'] },
  { key: 'voltage', label: 'Phase·Voltage', options: ['', 'Φ3 380V', 'Φ3 440V', 'Φ1 220V'] },
]

function DetailSelectModal({ block, initial, onClose, onSave }: {
  block: CanvasBlock | null
  initial?: Record<string, string>
  onClose: () => void
  onSave: (opts: Record<string, string>) => void
}) {
  const { t } = useI18n()
  const [opts, setOpts] = useState<Record<string, string>>({})
  useEffect(() => { setOpts(initial ?? {}) }, [block?.id, initial])
  if (!block) return null
  return (
    <Modal open onClose={onClose} title={`${t('cpq.detailSelect', '모듈 세부선정')} — ${block.name}`} width={380}>
      <div data-detail-select style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', fontSize: 11 }}>
        {DETAIL_FIELDS.map((f) => (
          <span key={f.key} style={{ display: 'contents' }}>
            <label>{f.label}</label>
            <select className="in" value={opts[f.key] ?? ''} style={{ height: 20, fontSize: 10.5 }}
              onChange={(e) => setOpts((m) => ({ ...m, [f.key]: e.target.value }))}>
              {f.options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
          </span>
        ))}
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
          <button className="b run" data-detail-save onClick={() => onSave(opts)}>{t('common.save', '저장')}</button>
          <button className="b" onClick={onClose}>{t('common.close', '닫기')}</button>
        </div>
      </div>
    </Modal>
  )
}
