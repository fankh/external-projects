/** S-1-4 Code Relationship (W-05, 슬라이드 36) — Mother-Child slot_map ·
 *  Running Test 통과(CODE-009)해야 승인 요청 가능. */
import { useEffect, useMemo, useState } from 'react'
import { MOTHER, type RunningTestRow } from '../../api/mock/dataCode'
import { relationshipService, type ChildRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const SLOT_OPTS: Record<string, string[]> = { B: ['13', '21', '32'], C: ['32', '45'], E: ['15', '21'] }

export function CodeRelationshipScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [children, setChildren] = useState<ChildRow[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [slots, setSlots] = useState<Record<string, string>>({ B: '13', C: '32', E: '15' })
  const [testRows, setTestRows] = useState<RunningTestRow[] | null>(null)
  const [tested, setTested] = useState(false)

  useEffect(() => {
    void relationshipService.children(MOTHER.code).then((rows) => {
      setChildren(rows)
      setChecked(new Set(rows.map((c) => c.code)))
    })
  }, [])

  const runTest = () => {
    void (async () => {
      const rows = await relationshipService.runningTest(MOTHER.code, slots, checked)
      setTestRows(rows)
      setTested(true)
      shell.setStatusMsg(`Running Test ✓ — ${rows.length - 1} Child 전개 (순환 참조 없음, CODE-009)`)
    })()
  }

  useFKeys(active, useMemo(() => ({ F9: runTest }), [slots, checked])) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
    setTested(false)
  }

  const childCols: GridColumn<ChildRow>[] = [
    {
      key: 'chk', header: '☑', width: 26, align: 'center',
      render: (r) => (
        <input type="checkbox" checked={checked.has(r.code)} aria-label={`선택 ${r.code}`}
          onChange={() => toggle(r.code)} />
      ),
    },
    { key: 'code', header: 'Child', width: 74, code: true, render: (r) => r.code },
    { key: 'desc', header: 'Desc.', render: (r) => r.desc },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 120, render: (r) => r.remarks },
    { key: 'data', header: 'Data', width: 36, align: 'center', render: () => '📄' },
  ]

  const testCols: GridColumn<RunningTestRow>[] = [
    { key: 'no', header: 'No.', width: 36, align: 'center', render: (r) => r.no },
    { key: 'name', header: 'Name', code: true, render: (r) => r.name },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 110, render: (r) => r.remarks },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.15, overflow: 'auto' }}>
          <GroupBox
            title={<span>Mother : <b style={{ color: 'var(--err)' }}>{MOTHER.code}</b>
              <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> {MOTHER.desc}</span></span>}
            right={<Chip tone="ok">Approved</Chip>} noPad>
            <table className="g">
              <thead>
                <tr>{MOTHER.slots.map((s) => <th key={s.slot}>{s.slot} : {s.label}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{MOTHER.slots.map((s) => <td key={s.slot} className="code">{s.values}</td>)}</tr>
              </tbody>
            </table>
          </GroupBox>
          <div style={{ display: 'flex', gap: 6 }}>
            <Cvs blocks={[{ id: 'm', name: 'Mother', sub: MOTHER.code, x: 30, y: 12, w: 120, h: 60 }]}
              style={{ width: 190, height: 90 }} />
            <div style={{ flex: 1, fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              Code Source: 각 Slot 의 항목 정의 표시 · 3D ☑ 2D ☐<br />
              Slot 매핑(slot_map)으로 Mother 값이 Child 코드 자릿수에 전파 (CODE-008)
            </div>
          </div>
          <GroupBox title="Add Child" right={<>
            <Combo width={130} value="Product / Sub Code" options={['Product / Sub Code', 'X-Code']} />
            <Btn onClick={() => shell.setStatusMsg('Child 추가 — Slot 매핑 후 Running Test 필요')}>＋ Add</Btn>
          </>}>
            <div className="frm">
              <label>Child Code</label>
              <input className="in ro" value="KDI 21" readOnly aria-label="Child Code" />
              <label>Description</label>
              <input className="in" defaultValue="Inlet Cone W/O FF" aria-label="Child Description" />
              <label>Q'ty</label>
              <input className="in" defaultValue="2" style={{ maxWidth: 64 }} aria-label="Qty" />
              <label>Slot 매핑</label>
              <input className="in" defaultValue="A↔A · B↔B · C↔C" aria-label="Slot 매핑" />
            </div>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title="[ Child Group ] — 더블클릭=코드 상세" right={<Chip tone="ok">Approved</Chip>} noPad>
            <DenseGrid columns={childCols} rows={children} rowKey={(r) => r.code}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.code}`, screenId: 'code-detail',
                code: '상세', title: r.code, params: { code: r.code, name: r.desc },
              })} />
          </GroupBox>
          <GroupBox style={{ flex: 1 }}
            title="[ Part List Running Test ]"
            right={<>
              {Object.entries(SLOT_OPTS).map(([s, opts]) => (
                <Combo key={s} width={56} value={slots[s]} options={opts}
                  onChange={(v) => { setSlots((p) => ({ ...p, [s]: v })); setTested(false) }} />
              ))}
              <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={runTest}>Run ▶ F9</Btn>
            </>} noPad>
            {testRows
              ? <DenseGrid columns={testCols} rows={testRows} rowKey={(r) => r.no} />
              : (
                <div style={{ padding: 10, color: 'var(--txt-mute)', fontSize: 11 }}>
                  Mother Slot 조합(B·C·E)을 선택하고 Run — 조건 일치 Child 전량 전개 검증
                </div>
              )}
          </GroupBox>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
            {tested ? <Chip tone="ok">Running Test 통과</Chip> : <Chip tone="warn">Test 필요</Chip>}
            <Btn variant="pri" disabled={!tested}
              onClick={() => shell.setStatusMsg('승인 요청 — Code Relationship (PENDING)')}>
              승인 요청
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
