/** S-1-2 Variant·Constant 관리 (B13-2) — 그룹 슬롯별 값 목록 + 값 등록 (PENDING→승인).
 *  code_item · code_item_value 실데이터 — 승인된 값만 C-1 슬롯 콤보에 노출 (CODE-003). */
import { useEffect, useMemo, useState } from 'react'
import { codeValueService, type CodeValueRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  APPROVED: 'ok', PENDING: 'warn', DRAFT: 'info',
}

export function VariantConstantScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [group, setGroup] = useState('KOF')
  const [rows, setRows] = useState<CodeValueRow[]>([])
  const [offline, setOffline] = useState(false)
  const [slotFilter, setSlotFilter] = useState('전체')
  const [add, setAdd] = useState({ slot: '', valueCode: '', valueName: '' })

  const load = async () => {
    const r = await codeValueService.list(group)
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setRows(r)
  }
  useEffect(() => { void load() }, [group]) // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useMemo(() => [...new Set(rows.map((r) => r.slot))], [rows])
  const visible = rows.filter((r) => slotFilter === '전체' || r.slot === slotFilter)

  const register = () => {
    if (!add.slot.trim() || !add.valueCode.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — Slot·값 코드</span>)
      return
    }
    void (async () => {
      try {
        if (!await codeValueService.add({ group, ...add })) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        await load()
        setStatusMsg(`값 등록 ✓ — ${group}/${add.slot} ${add.valueCode} (PENDING · 승인 요청 자동, CODE-006)`)
        setAdd({ slot: '', valueCode: '', valueName: '' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F8: () => { void load(); setStatusMsg(`값 목록 재조회 — ${group} (code_item_value)`) },
  }), [group])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<CodeValueRow>[] = [
    { key: 'slot', header: 'Slot', width: 40, align: 'center', code: true, render: (r) => r.slot },
    { key: 'item', header: '항목', width: 110, render: (r) => r.itemName },
    { key: 'vc', header: '값 코드', width: 70, code: true, render: (r) => r.valueCode || '—' },
    { key: 'vn', header: '값 명칭', render: (r) => r.valueName || '—' },
    {
      key: 'st', header: '상태', width: 76, align: 'center',
      render: (r) => (r.status === '-' ? '—'
        : <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Code Group</label>
        <Combo width={90} value={group} options={['KOF', 'KDC']} onChange={setGroup} />
        <label>Slot</label>
        <Combo width={70} value={slotFilter} options={['전체', ...slots]} onChange={setSlotFilter} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          승인(APPROVED)된 값만 C-1 슬롯 콤보·BOM 전개에 노출 (CODE-003)
        </span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`값 목록 — ${group} (${visible.length})`} noPad style={{ flex: 1 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 값 목록은 실DB(code_item_value)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={visible} rowKey={(_, i) => i} />
          )}
        </GroupBox>
        <div className="split-h" />
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="값 등록 — PENDING 승인 흐름">
            <div className="frm c2">
              <label>Slot *</label>
              <input className="in req" value={add.slot} aria-label="값 Slot" placeholder="B"
                onChange={(e) => setAdd({ ...add, slot: e.target.value })} />
              <label>값 코드 *</label>
              <input className="in req" value={add.valueCode} aria-label="값 코드" placeholder="25"
                onChange={(e) => setAdd({ ...add, valueCode: e.target.value })} />
              <label>값 명칭</label>
              <input className="in" value={add.valueName} aria-label="값 명칭"
                onChange={(e) => setAdd({ ...add, valueName: e.target.value })} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </GroupBox>
          <GroupBox title="승인 흐름">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              등록 → PENDING + 승인함(M-15-2) 자동 등재 →<br />
              승인 시 APPROVED 전이 → C-1 콤보 노출<br />
              중복 값 코드는 409 거부 (CODE-006)
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
