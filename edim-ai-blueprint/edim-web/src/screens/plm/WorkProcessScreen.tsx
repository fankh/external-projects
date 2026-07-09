/** S-4-1-2 Work Process 공정 데이터 (W-19) — 제조비 계산(CST-003) 입력.
 *  MAKE/BUY 구분이 Pricing Run 의 원가 경로를 결정. */
import { useEffect, useMemo, useState } from 'react'
import type { MaterialRow } from '../../api/types'
import { MACRO_CODING, MATERIAL_ROWS, PROCESS_DEF, PROCESS_OPTIONS } from '../../api/mock/data'
import { workProcessService } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function WorkProcessScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [process, setProcess] = useState(PROCESS_DEF.process)
  const [workplace, setWorkplace] = useState(PROCESS_DEF.workplace)
  const [person, setPerson] = useState(String(PROCESS_DEF.person))
  const [skill, setSkill] = useState(PROCESS_DEF.skill)
  const [wtime, setWtime] = useState(String(PROCESS_DEF.wtimeHr))
  const [rows, setRows] = useState<MaterialRow[]>(MATERIAL_ROWS)
  const [selItem, setSelItem] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // 저장된 MAKE/BUY 실데이터 복원 (erp_work_process)
  useEffect(() => {
    void workProcessService.get().then((saved) => {
      if (saved && saved.length) {
        setRows((prev) => prev.map((r) => {
          const s = saved.find((x) => x.item === r.item)
          return s ? { ...r, makeBuy: s.makeOrBuy, timeMin: s.makeOrBuy === 'BUY' ? null : (r.timeMin ?? 45) } : r
        }))
      }
    })
  }, [])

  const save = () => {
    void workProcessService.save(rows.map((r) => ({ item: r.item, makeOrBuy: r.makeBuy })))
      .then((ok) => {
        if (ok) {
          setDirty(false)
          shell.setStatusMsg('공정 데이터 저장 ✓ — erp_work_process 영속 (CST-003 원가 경로 반영)')
        } else {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>)
        }
      })
  }

  useFKeys(active, useMemo(() => ({ F12: save }), [rows])) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMakeBuy = (item: string) => {
    setRows((prev) => prev.map((r) => (r.item === item
      ? { ...r, makeBuy: r.makeBuy === 'MAKE' ? 'BUY' : 'MAKE', timeMin: r.makeBuy === 'MAKE' ? null : 45 }
      : r)))
    setDirty(true)
  }

  const cols: GridColumn<MaterialRow>[] = [
    { key: 'item', header: 'Item', width: 50, code: true, render: (r) => r.item },
    { key: 'wh', header: 'Warehouse', width: 70, align: 'center', render: (r) => r.warehouse },
    { key: 'min', header: 'Min Stock', width: 62, align: 'right', render: (r) => r.minStock },
    { key: 'sup', header: '공급자', width: 70, render: (r) => r.supplier },
    {
      key: 'mb', header: '제조/구매 (더블클릭 전환)', width: 130, align: 'center',
      render: (r) => (
        <span onDoubleClick={() => toggleMakeBuy(r.item)} style={{ cursor: 'pointer' }}>
          <Chip tone={r.makeBuy === 'MAKE' ? 'info' : 'ok'}>{r.makeBuy}</Chip>
        </span>
      ),
    },
    {
      key: 'time', header: 'Time(분)', width: 58, align: 'right',
      render: (r) => (r.timeMin == null ? '-' : r.timeMin),
    },
    { key: 'rem', header: 'Remarks', render: (r) => r.remarks },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Process</label>
        <Combo width={110} value={process} options={PROCESS_OPTIONS.process}
          onChange={(v) => { setProcess(v); setDirty(true) }} />
        <label>Work place</label>
        <Combo width={110} value={workplace} options={PROCESS_OPTIONS.workplace}
          onChange={(v) => { setWorkplace(v); setDirty(true) }} />
        <label>Person</label>
        <input className="in" style={{ width: 40 }} value={person} aria-label="Person"
          onChange={(e) => { setPerson(e.target.value); setDirty(true) }} />
        <label>Skill</label>
        <Combo width={60} value={skill} options={PROCESS_OPTIONS.skill}
          onChange={(v) => { setSkill(v); setDirty(true) }} />
        <label>W. Time</label>
        <input className="in" style={{ width: 48 }} value={wtime} aria-label="W Time"
          onChange={(e) => { setWtime(e.target.value); setDirty(true) }} />
        <span className="unit">hr</span>
        <span style={{ flex: 1 }} />
        {dirty ? <Chip tone="warn">미저장 변경</Chip> : null}
        <Btn variant="pri" onClick={save}>저장 F12</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1, padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title={`공정 정의 — KDCR 3-13 · ${process} @ ${workplace}`} noPad>
            <DenseGrid columns={cols} rows={rows}
              rowKey={(r) => r.item} selectedKey={selItem}
              onRowClick={(r) => setSelItem(r.item)} />
          </GroupBox>
          <GroupBox title="CAD Mapping ☑"
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>3D ☑ 2D ☐</span>}>
            <Cvs blocks={[
              { id: 'c', name: 'Casing', x: 40, y: 20, w: 130, h: 80 },
              { id: 'i', name: 'Impeller', sub: selItem ?? '—', x: 66, y: 34, w: 78, h: 52 },
            ]} selectedId={selItem ? 'i' : null}
              style={{ height: 120 }} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 296, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title="Coding" right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }}
              onClick={() => shell.setStatusMsg('제조비 산식 평가 ✓ — 시간×임율×장비 (DWG-021)')}>
              Run
            </Btn>
          }>
            <Fx>{MACRO_CODING}</Fx>
          </GroupBox>
          <GroupBox title="Code">
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }}
              value="KDCR 3-13" readOnly aria-label="Code" />
          </GroupBox>
          <GroupBox title="Table — Work Process" noPad
            right={<span className="b" style={{ height: 18, fontSize: 10 }}>＋ ✎ ⬇</span>}>
            <table className="g">
              <thead><tr><th>Item</th><th>A</th><th>C</th><th>E</th></tr></thead>
              <tbody>
                <tr><td className="code">560</td><td className="num"></td><td className="num">45</td><td className="num">656</td></tr>
                <tr><td className="code">630</td><td className="num"></td><td className="num">45</td><td className="num">656</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="원가 경로 (Pricing Run)">
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              MAKE {rows.filter((r) => r.makeBuy === 'MAKE').length}건 → 제조비 (시간×임율)<br />
              BUY {rows.filter((r) => r.makeBuy === 'BUY').length}건 → 구매 단가 resolve<br />
              <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
                MAKE/BUY 전환은 Material Data 더블클릭
              </span>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
