/** M-4-2 Arrangement Set-Up (B13) — 구성 코드 대장 + 구성품(Component) 관리.
 *  arrangement_code · arrangement_component 실 CRUD — 등록 시 승인 요청 자동 (DRAFT). */
import { useEffect, useMemo, useState } from 'react'
import {
  arrangementService, type ArrangementComponent, type ArrangementRow,
} from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function ArrangementSetupScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<ArrangementRow[]>([])
  const [offline, setOffline] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [comps, setComps] = useState<ArrangementComponent[]>([])
  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState({ code: '', name: '', family: 'AHU', direction: '', install: '' })
  const [comp, setComp] = useState({ productCode: '', position: '', quantity: '1' })
  const [editComp, setEditComp] = useState<ArrangementComponent | null>(null)   // F5 — 수량 수정
  useEscapeClose(showReg, () => setShowReg(false))

  const loadComps = (code: string) => {
    void arrangementService.components(code).then((c) => setComps(c ?? []))
  }

  const load = async () => {
    const r = await arrangementService.list()
    if (r === null) { setOffline(true); return }
    setRows(r)
    if (r.length && !sel) setSel(r[0].code)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sel) { setComps([]); return }
    void loadComps(sel)
  }, [sel])

  const register = () => {
    if (!reg.code.trim() || !reg.name.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — Code·명칭</span>)
      return
    }
    void (async () => {
      try {
        if (!await arrangementService.create(reg)) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        await load()
        setSel(reg.code.trim())
        setStatusMsg(`Arrangement 등록 ✓ — ${reg.code} (DRAFT · 승인 요청 자동)`)
        setReg({ code: '', name: '', family: 'AHU', direction: '', install: '' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const addComp = () => {
    if (!sel || !comp.productCode.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>구성품 — Arrangement 선택 + Code 입력</span>)
      return
    }
    void (async () => {
      try {
        if (!await arrangementService.addComponent(sel, {
          productCode: comp.productCode.trim(), position: comp.position.trim(),
          quantity: Number(comp.quantity) || 1,
        })) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>추가 불가 — 백엔드 연결 필요</span>)
          return
        }
        await arrangementService.components(sel).then((c) => setComps(c ?? []))
        await load()
        setStatusMsg(`구성품 추가 ✓ — ${comp.productCode} @ ${sel}`)
        setComp({ productCode: '', position: '', quantity: '1' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '추가 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('plm-arr')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowReg(true)
    },
    F8: () => { void load(); setStatusMsg('Arrangement 재조회 (arrangement_code)') },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<ArrangementRow>[] = [
    { key: 'code', header: 'Code', width: 80, code: true, render: (r) => r.code },
    { key: 'name', header: '구성 명칭', render: (r) => r.name },
    { key: 'fam', header: 'Family', width: 50, align: 'center', render: (r) => r.family },
    { key: 'n', header: '구성품', width: 44, align: 'right', render: (r) => r.components },
    {
      key: 'st', header: '상태', width: 70, align: 'center',
      render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'warn'}>{r.status}</Chip>,
    },
  ]

  const compCols: GridColumn<ArrangementComponent>[] = [
    { key: 'pos', header: 'Position', width: 66, align: 'center', code: true, render: (r) => r.position || '—' },
    { key: 'code', header: 'Code', width: 96, code: true, render: (r) => r.code },
    { key: 'name', header: '품명', render: (r) => r.name },
    { key: 'qty', header: "Q'ty", width: 40, align: 'right', render: (r) => r.quantity },  {
      key: 'act', header: '', width: 58, align: 'center',
      render: (r) => (r.componentId ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <span className="b" style={{ height: 17, fontSize: 10 }} title="수량 수정"
            onClick={() => {
              if (!perm.canWrite('plm-arr')) { setStatusMsg(perm.denyWrite); return }
              setEditComp(r)
            }}>✎</span>
          <span className="b" style={{ height: 17, fontSize: 10 }} title="구성품 삭제"
            onClick={() => {
              if (!perm.canWrite('plm-arr')) { setStatusMsg(perm.denyWrite); return }
              if (!sel || !r.componentId) return
              void arrangementService.removeComponent(sel, r.componentId).then((ok) => {
                if (!ok) { setStatusMsg('삭제 불가 — 백엔드 연결 필요 (mock)'); return }
                void loadComps(sel)
                setStatusMsg(`구성품 삭제 ✓ — ${r.code} (ARR_COMP_DELETE 감사)`)
              })
            }}>✕</span>
        </span>
      ) : null),
    },
  ]

  const selRow = rows.find((r) => r.code === sel) ?? null

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Product Family</label>
        <Combo width={90} value="전체" options={['전체', 'AHU', 'FAN']} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          구성 코드 = 배치 조건(방향·설치) + 구성품 목록 — C-1 Arrangement 콤보의 원천
        </span>
        <span style={{ flex: 1 }} />
        <Btn variant="pri" disabled={!perm.canWrite('plm-arr')}
          title={perm.canWrite('plm-arr') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>＋ 등록 F2</Btn>
      </div>
      {showReg ? (
        <div data-arr-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>Arrangement 등록 — arrangement_code</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>Code *</label>
              <input className="in req" value={reg.code} aria-label="구성 Code" placeholder="ARR-XXX"
                onChange={(e) => setReg({ ...reg, code: e.target.value })} />
              <label>명칭 *</label>
              <input className="in req" value={reg.name} aria-label="구성 명칭"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>Family</label>
              <Combo width={130} value={reg.family} options={['AHU', 'FAN']}
                onChange={(v) => setReg({ ...reg, family: v })} />
              <label>방향 옵션</label>
              <input className="in" value={reg.direction} aria-label="방향 옵션"
                onChange={(e) => setReg({ ...reg, direction: e.target.value })} />
              <label>설치 옵션</label>
              <input className="in" value={reg.install} aria-label="설치 옵션"
                onChange={(e) => setReg({ ...reg, install: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>취소</Btn>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {editComp && sel ? (
        <QuickEditDialog dataAttr="comp-edit" title={`구성품 수량 — ${editComp.code}`}
          fields={[
            { key: 'quantity', label: '수량', value: String(editComp.quantity), required: true },
          ]}
          onClose={() => setEditComp(null)}
          onSubmit={async (v) => {
            const q = Number(v.quantity)
            if (!Number.isFinite(q) || q <= 0) return '수량은 0보다 큰 숫자여야 합니다'
            if (!editComp.componentId) return '백엔드 연결 필요 (mock 모드)'
            const ok = await arrangementService.updateComponent(sel, editComp.componentId, q)
            if (!ok) return '백엔드 연결 필요 (mock 모드)'
            setEditComp(null)
            void loadComps(sel)
            setStatusMsg(`수량 수정 ✓ — ${editComp.code} → ${q} (ARR_COMP_UPDATE 감사)`)
            return null
          }} />
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`구성 코드 대장 — ${rows.length}건`} noPad style={{ flex: 1.1 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — Arrangement 는 실DB(arrangement_code)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.code}
              selectedKey={sel} onRowClick={(r) => setSel(r.code)} />
          )}
        </GroupBox>
        <div className="split-h" />
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={sel ? `구성품 — ${sel} (${comps.length})` : '구성품 — 선택 없음'} noPad>
            <DenseGrid columns={compCols} rows={comps} rowKey={(_, i) => i} />
          </GroupBox>
          <GroupBox title="구성품 추가">
            <div className="frm c2">
              <label>Code *</label>
              <input className="in req" value={comp.productCode} aria-label="구성품 Code" placeholder="KDP 1-21"
                onChange={(e) => setComp({ ...comp, productCode: e.target.value })} />
              <label>Position</label>
              <input className="in" value={comp.position} aria-label="Position" placeholder="CENTER"
                onChange={(e) => setComp({ ...comp, position: e.target.value })} />
              <label>수량</label>
              <input className="in" value={comp.quantity} aria-label="구성품 수량"
                onChange={(e) => setComp({ ...comp, quantity: e.target.value })} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="pri" onClick={addComp}>＋ 추가</Btn>
            </div>
          </GroupBox>
          {selRow ? (
            <GroupBox title="배치 조건">
              <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                방향: {selRow.direction || '—'}<br />
                설치: {selRow.install || '—'}<br />
                <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
                  join_macro 바인딩은 Macro Studio(S-2-2)에서 관리
                </span>
              </div>
            </GroupBox>
          ) : null}
        </div>
      </div>
    </div>
  )
}
