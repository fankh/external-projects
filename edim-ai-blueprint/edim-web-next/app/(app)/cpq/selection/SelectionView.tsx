'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CanvasBlock, CadDocument } from '@/lib/cadTypes'
import { CadSvg } from '@/components/CadSvg'
import { useI18n } from '@/components/I18nProvider'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { CommandLine, Cvs } from '@/components/Cvs'
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
  const blocks = props.arrBlocks ?? AHU_BLOCKS

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
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ flex: 1.2, gap: 4 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{t('cpq.arrangement', '구성도 (Arrangement)')}</span>
            <Btn variant={cadMode ? 'default' : 'pri'} onClick={() => cadMode && toggleCad()} style={{ height: 18, fontSize: 9.5 }}>{t('cpq.block', '블록')}</Btn>
            <Btn variant={cadMode ? 'pri' : 'default'} onClick={() => !cadMode && toggleCad()} style={{ height: 18, fontSize: 9.5 }}>CAD</Btn>
          </div>
          {cadMode ? (
            <div style={{ flex: 1, minHeight: 280, border: '1px solid var(--line)', background: '#fff' }}>
              {cadDoc ? <CadSvg doc={cadDoc} /> : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>{cadOffline ? t('cpq.cadOffline', 'CAD 서버 연결 실패') : t('cpq.drawing', '작도 중…')}</div>}
            </div>
          ) : (
            <Cvs blocks={blocks} selectedId={selBlock?.id ?? null} onSelect={setSelBlock} style={{ flex: 1, minHeight: 280 }} />
          )}
          <CommandLine prompt={selBlock ? `${t('cpq.cmdSelected', '선택')}=${selBlock.name}  ${t('cpq.cmdBasePoint', '기준점 지정 >')}` : t('cpq.cmdIdle', '명령 대기 >')} coord={t('cpq.snapOn', '스냅 ON')} onCommand={(cmd) => say(`명령 실행: ${cmd}`)} />
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
