/** S-1-1 Sub Code 등록 (W-04 / 디자인시안 b04) — 마스터(그리드)-디테일(폼) 표준형.
 *  중복검토(CODE-006) · 승인 요청 → PENDING 행 추가. */
import { useEffect, useMemo, useState } from 'react'
import type { SubCodeSlot } from '../../api/mock/dataCode'
import { codeSetupService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function SubCodeScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [rows, setRows] = useState<SubCodeSlot[]>([])
  const [selSlot, setSelSlot] = useState<string | null>(null)

  useEffect(() => {
    void codeSetupService.groupTable('KOF').then(setRows)
  }, [])
  const [newItemNo, setNewItemNo] = useState('G')
  const [newDesc, setNewDesc] = useState('Impeller Type')
  const [newValues, setNewValues] = useState('Airfoil · Forward · 900 1000 1120')
  const [dupChecked, setDupChecked] = useState(false)

  const nextSlot = () => String.fromCharCode(65 + rows.length) // A=65

  const reset = () => {
    setNewItemNo(nextSlot())
    setNewDesc('')
    setNewValues('')
    setDupChecked(false)
    shell.setStatusMsg('신규 항목 입력 (F2)')
  }

  const checkDup = () => {
    const dup = rows.some((r) => r.slot === newItemNo.trim().toUpperCase())
    setDupChecked(!dup)
    shell.setStatusMsg(dup
      ? <span style={{ color: 'var(--err)' }}>중복 — Item {newItemNo} 이미 등록됨 (CODE-006)</span>
      : `중복 없음 ✓ — Item ${newItemNo} 사용 가능`)
  }

  const requestApproval = () => {
    if (!newItemNo.trim() || !newDesc.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) 미입력</span>)
      return
    }
    const slot = newItemNo.trim().toUpperCase()
    const values = newValues.split(/[·,]+|\s{2,}/).map((v) => v.trim()).filter(Boolean)
    void (async () => {
      try {
        const mode = await codeSetupService.addItem('KOF', slot, newDesc, values)
        if (mode === 'live') {
          setRows(await codeSetupService.groupTable('KOF'))
        } else {
          setRows((prev) => [
            ...prev.filter((r) => r.slot !== slot),
            { slot, label: newDesc, values: newValues, count: values.length, status: 'PENDING' },
          ])
        }
        setSelSlot(slot)
        shell.setStatusMsg(`승인 요청 — ${slot} · ${newDesc} (code_item PENDING → 승인함 등록)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: reset,
    F8: () => shell.setStatusMsg(`조회 — Group KOF · ${rows.length}개 Slot`),
    F12: () => shell.setStatusMsg('저장 완료 (승인 전 DRAFT)'),
  }), [rows.length])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<SubCodeSlot>[] = [
    { key: 'slot', header: 'Slot', width: 34, align: 'center', render: (r) => <b>{r.slot}</b> },
    { key: 'label', header: '항목', width: 110, render: (r) => r.label },
    { key: 'values', header: '값 목록', code: true, render: (r) => r.values },
    { key: 'count', header: '건수', width: 40, align: 'right', render: (r) => r.count },
    {
      key: 'status', header: '상태', width: 52, align: 'center',
      render: (r) => (r.status === 'APPROVED'
        ? <Chip tone="ok">승인</Chip> : <Chip tone="warn">대기</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Group<i>*</i></label>
        <input className="in req" style={{ width: 64 }} defaultValue="KOF" aria-label="Group" />
        <label>설명</label>
        <input className="in" style={{ width: 170 }} defaultValue="Specification - Fan" aria-label="설명" />
        <label>승인상태</label>
        <Combo width={84} value="전체" options={['전체', '승인', '대기']} />
        <span style={{ flex: 1 }} />
        <Btn onClick={() => shell.setStatusMsg(`조회 — Group KOF · ${rows.length}개 Slot`)}>조회 F8</Btn>
        <Btn onClick={reset}>신규 F2</Btn>
        <Btn onClick={checkDup}>중복검토</Btn>
        <Btn variant="pri">저장 F12</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox style={{ flex: 1.3 }} noPad
          title="Registered Code Table — KOF"
          right={<>
            <Chip tone="ok">Approved</Chip>
            <span className="b" style={{ height: 18, fontSize: 10 }}>Excel ⬆⬇</span>
          </>}>
          <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.slot}
            selectedKey={selSlot} onRowClick={(r) => setSelSlot(r.slot)} />
        </GroupBox>
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={`신규 항목 (${newItemNo || nextSlot()}) — 필수는 노란 셀`}>
            <div className="frm c2">
              <label>Item No<i>*</i></label>
              <input className="in req" value={newItemNo} aria-label="Item No"
                onChange={(e) => { setNewItemNo(e.target.value); setDupChecked(false) }} />
              <label>설명<i>*</i></label>
              <input className="in req" value={newDesc} aria-label="설명(신규)"
                onChange={(e) => setNewDesc(e.target.value)} />
              <label>Sub Item</label>
              <input className="in" value={newValues} aria-label="Sub Item"
                onChange={(e) => setNewValues(e.target.value)} />
              <label>참조 Table</label>
              <Combo value="— 없음" options={['— 없음', 'Table12 (Variant)']} />
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
              {dupChecked ? <Chip tone="ok">중복검토 ✓</Chip> : null}
              <Btn>＋ 값 추가</Btn>
              <Btn variant="pri" onClick={requestApproval}>승인 요청</Btn>
            </div>
          </GroupBox>
          <GroupBox title="코드 자산 — KDCR 3-13" style={{ flex: 1 }}>
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              <b style={{ color: 'var(--title-navy)' }}>DWG</b> PDF·CAD
              <Chip tone="info">3D ☑ 2D ☐</Chip>
              <Cvs blocks={[{ id: 'p', name: 'Casing', sub: 'KDCR 3-13', x: 40, y: 8, w: 120, h: 56 }]}
                style={{ height: 76, margin: '4px 0' }} />
              <b style={{ color: 'var(--title-navy)' }}>Table</b> KDCR 3-13 (Variant)
              <span className="b" style={{ float: 'right', height: 18, fontSize: 10 }}
                onClick={() => shell.openTab({ id: 'code-datatable', screenId: 'code-datatable', code: 'M-3-7', title: '데이터 Table' })}>
                열기
              </span>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
