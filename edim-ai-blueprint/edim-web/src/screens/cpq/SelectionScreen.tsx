/** C-1 CPQ 제품 선정 (W-02 / 디자인시안 b03) —
 *  조회밴드 F8 · 구성 캔버스+커맨드 라인 · 슬롯 선택 → BOM 재전개 · EDIM Run F9. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { codeService } from '../../api/services'
import type { BomItem, CanvasBlock } from '../../api/types'
import { AHU_BLOCKS, DEFAULT_SLOT_VALUES, PRODUCT_SLOTS } from '../../api/mock/data'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { CommandLine, Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

let runTabSeq = 1

export function SelectionScreen({ active }: ScreenProps) {
  const shell = useShell()
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

  const apply = useCallback(async (sv: Record<string, string>) => {
    setBusy(true)
    try {
      const r = await codeService.expand(sv)
      setFinished(r.finishedGoodsCode)
      setBom(r.items)
      shell.setStatusMsg(`BOM 재전개 ${r.items.length}항목 (전체 47)`)
    } finally {
      setBusy(false)
    }
  }, [shell])

  useEffect(() => { void apply(DEFAULT_SLOT_VALUES) }, [apply])

  const startRun = useCallback(() => {
    const n = runTabSeq++
    shell.openTab({
      id: `cpq-run:${n}`, screenId: 'cpq-run',
      code: 'Run', title: `실행 #${n}`,
    })
  }, [shell])

  useFKeys(active, useMemo(() => ({
    F8: () => { void apply(slotValues) },
    F9: startRun,
  }), [apply, slotValues, startRun]))

  const setSlot = (slot: string, v: string) => {
    const next = { ...slotValues, [slot]: v }
    setSlotValues(next)
    void apply(next)   // 슬롯 변경 = 즉시 재전개 (CPQ-004)
  }

  const totalK = bom.reduce((s, b) => s + (b.priceK ?? 0) * b.quantity, 0)

  const cols: GridColumn<BomItem>[] = [
    { key: 'lv', header: 'Lv', width: 24, align: 'center', render: (r) => r.level },
    { key: 'code', header: 'Code', code: true, render: (r) => r.resolvedCode },
    { key: 'name', header: '품명', render: (r) => r.name },
    { key: 'qty', header: '수량', width: 30, align: 'right', render: (r) => r.quantity },
    {
      key: 'amt', header: '금액(K)', width: 62, align: 'right',
      render: (r) => (r.priceK == null ? '—' : (r.priceK * r.quantity).toLocaleString()),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project<i>*</i></label>
        <Combo width={120} value="Micron #7" options={['Micron #7', 'PS-61313-5']} />
        <label>Arrangement</label>
        <Combo width={140} value={arrangement} options={['Double Deck 2', 'Single Deck', 'Return Top']}
          onChange={setArrangement} />
        <label>풍량<i>*</i></label>
        <input className="in req" style={{ width: 56 }} value={airflow} aria-label="풍량"
          onChange={(e) => setAirflow(e.target.value)} />
        <span className="unit">CMM</span>
        <label>정압<i>*</i></label>
        <input className="in req" style={{ width: 56 }} value={pressure} aria-label="정압"
          onChange={(e) => setPressure(e.target.value)} />
        <span className="unit">mmAq</span>
        <span style={{ flex: 1 }} />
        <Btn>사양 Excel ⬆</Btn>
        <Btn variant="pri" disabled={busy} onClick={() => void apply(slotValues)}>
          {busy ? '적용 중…' : '적용 F8'}
        </Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1.2, padding: 6 }}>
          <Cvs blocks={AHU_BLOCKS} selectedId={selBlock?.id ?? null}
            onSelect={setSelBlock}
            dims={[{ x: 36, y: 10, w: 430, label: '4,504' }]}
            labels={[{ x: 472, y: 34, text: '3,254' }]}
            style={{ flex: 1, minHeight: 250 }} />
          <CommandLine
            prompt={selBlock ? `MOVE 선택=${selBlock.name}  ${cmdEcho}` : '명령 대기 >'}
            coord="X 2,140.5  Y 386.0 | 스냅 ON"
            onCommand={(cmd) => setCmdEcho(`${cmd} ✓ >`)} />
        </div>
        <div className="split-h" />
        <div style={{ width: 378, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title="완성품 Code" right={<Chip tone="ok">유효</Chip>}>
            <div style={{
              fontFamily: 'Consolas, monospace', fontSize: 11,
              color: 'var(--title-navy)', background: 'var(--req-yellow)', padding: '3px 6px',
            }}>
              {finished || '—'}
            </div>
          </GroupBox>
          <GroupBox title="선택 사양 (Slot)">
            <div className="frm c2">
              {PRODUCT_SLOTS.map((s) => (
                <SlotRow key={s.slot} slot={s.slot} label={s.label}
                  values={s.values} value={slotValues[s.slot] ?? ''} onChange={setSlot} />
              ))}
            </div>
          </GroupBox>
          <GroupBox title="BOM · 실시간 가격" style={{ flex: 1 }} noPad
            right={<span className="b" style={{ height: 18, fontSize: 10 }}>전체 47</span>}>
            <DenseGrid columns={cols} rows={bom}
              rowKey={(r) => r.resolvedCode}
              selectedKey={selBom}
              onRowClick={(r) => setSelBom(r.resolvedCode)}
              footer={<>
                <td colSpan={4}>합계 (47항목)</td>
                <td className="num">{totalK.toLocaleString()}</td>
              </>} />
          </GroupBox>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn style={{ flex: 1, justifyContent: 'center' }}>견적 미리보기</Btn>
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
