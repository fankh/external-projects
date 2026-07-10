/** M-3-2 Raw Material·GPI (B13-2) — 재질 마스터 대장 + 등록 (mat_material 실 CRUD).
 *  PLM > Material (M-4-4) 도 동일 도메인 화면을 공유한다 (원자재 ↔ 부품 재질 매핑 원천). */
import { useEffect, useMemo, useState } from 'react'
import { materialService, type MaterialRowApi } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function MaterialGpiScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<MaterialRowApi[]>([])
  const [offline, setOffline] = useState(false)
  const [typeFilter, setTypeFilter] = useState('전체')
  const [showReg, setShowReg] = useState(false)
  const [editRow, setEditRow] = useState<MaterialRowApi | null>(null)   // F5
  const [reg, setReg] = useState({
    code: '', name: '', materialType: 'STEEL', density: '', standard: '', hazard: '',
  })

  const load = async () => {
    const r = await materialService.list()
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setRows(r)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.filter((r) => typeFilter === '전체' || r.materialType === typeFilter)

  const register = () => {
    if (!reg.code.trim() || !reg.name.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 재질 코드·명</span>)
      return
    }
    void (async () => {
      try {
        if (!await materialService.create({
          code: reg.code, name: reg.name, materialType: reg.materialType,
          density: reg.density.trim() === '' ? null : Number(reg.density),
          standard: reg.standard, hazard: reg.hazard,
        })) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        await load()
        setStatusMsg(`재질 등록 ✓ — ${reg.code} (mat_material)`)
        setReg({ code: '', name: '', materialType: 'STEEL', density: '', standard: '', hazard: '' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('code-raw')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowReg(true)
    },
    F8: () => { void load(); setStatusMsg('재질 마스터 재조회 (mat_material)') },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<MaterialRowApi>[] = [
    { key: 'code', header: 'GPI Code', width: 70, code: true, render: (r) => r.code },
    { key: 'name', header: '재질명', render: (r) => r.name },
    {
      key: 'type', header: '유형', width: 80, align: 'center',
      render: (r) => <Chip tone={r.materialType === 'STEEL' ? 'info' : 'ok'}>{r.materialType}</Chip>,
    },
    {
      key: 'den', header: '밀도(g/cm³)', width: 76, align: 'right',
      render: (r) => (r.density == null ? '—' : r.density),
    },
    { key: 'std', header: '규격', width: 88, render: (r) => r.standard || '—' },
    { key: 'haz', header: '유해 등급', width: 66, align: 'center', render: (r) => r.hazard || '—' },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>유형</label>
        <Combo width={100} value={typeFilter} options={['전체', 'STEEL', 'ALUMINUM', 'PLASTIC']}
          onChange={setTypeFilter} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          GPI(General Purpose Item) — Work Process 재질 매핑·제조비 밀도 계산의 원천 (CST-003)
        </span>
        <span style={{ flex: 1 }} />
        <Btn variant="pri" disabled={!perm.canWrite('code-raw')}
          title={perm.canWrite('code-raw') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>＋ 등록 F2</Btn>
      </div>
      {showReg ? (
        <div data-mat-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 330, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>재질 등록 — mat_material</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>GPI Code *</label>
              <input className="in req" value={reg.code} aria-label="재질 코드" placeholder="SS400"
                onChange={(e) => setReg({ ...reg, code: e.target.value })} />
              <label>재질명 *</label>
              <input className="in req" value={reg.name} aria-label="재질명"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>유형</label>
              <Combo width={130} value={reg.materialType} options={['STEEL', 'ALUMINUM', 'PLASTIC']}
                onChange={(v) => setReg({ ...reg, materialType: v })} />
              <label>밀도</label>
              <input className="in" value={reg.density} aria-label="밀도" placeholder="7.85"
                onChange={(e) => setReg({ ...reg, density: e.target.value })} />
              <label>규격</label>
              <input className="in" value={reg.standard} aria-label="규격" placeholder="KS D 3503"
                onChange={(e) => setReg({ ...reg, standard: e.target.value })} />
              <label>유해 등급</label>
              <input className="in" value={reg.hazard} aria-label="유해 등급"
                onChange={(e) => setReg({ ...reg, hazard: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>취소</Btn>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {editRow ? (
        <QuickEditDialog dataAttr="mat-edit" title={`재질 수정 — ${editRow.code}`}
          fields={[
            { key: 'name', label: '재질명', value: editRow.name, required: true },
            { key: 'materialType', label: '유형', value: editRow.materialType, type: 'combo',
              options: ['STEEL', 'ALUMINUM', 'PLASTIC'] },
            { key: 'density', label: '밀도', value: editRow.density != null ? String(editRow.density) : '' },
            { key: 'standard', label: '규격', value: editRow.standard },
            { key: 'hazard', label: '유해 등급', value: editRow.hazard },
          ]}
          onClose={() => setEditRow(null)}
          onSubmit={async (v) => {
            const ok = await materialService.update(editRow.code, {
              name: v.name, materialType: v.materialType,
              density: v.density.trim() ? Number(v.density) : null,
              standard: v.standard, hazard: v.hazard,
            })
            if (!ok) return '백엔드 연결 필요 (mock 모드)'
            setEditRow(null)
            await load()
            setStatusMsg(`재질 수정 ✓ — ${editRow.code} (mat_material · MATERIAL_UPDATE 감사)`)
            return null
          }} />
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`재질 마스터 — ${visible.length}건`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 재질 마스터는 실DB(mat_material)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={visible} rowKey={(r) => r.code}
              onRowDoubleClick={(r) => {
                if (!perm.canWrite('code-raw')) { setStatusMsg(perm.denyWrite); return }
                setEditRow(r)
              }} />
          )}
        </GroupBox>
      </div>
    </div>
  )
}
