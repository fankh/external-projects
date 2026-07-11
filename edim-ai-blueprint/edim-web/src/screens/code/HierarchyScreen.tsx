/** M-3-1 Hierarchy 주소 체계 (B14/B21) — sys_hierarchy 트리 조회 + 노드 편집 (등록/개명/삭제).
 *  /C(코드)·/M(Macro)·/T(Table) 주소가 tbx_macro·tbl 의 hierarchy_address 원천. */
import { useEffect, useMemo, useState } from 'react'
import { hierarchyService, sysService, type HierarchyNode } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TREE_TYPES = ['PRODUCT', 'GENERAL_DB', 'CONFIG']

export function HierarchyScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [treeType, setTreeType] = useState('PRODUCT')
  const [nodes, setNodes] = useState<HierarchyNode[]>([])
  const [offline, setOffline] = useState(false)
  const [sel, setSel] = useState<HierarchyNode | null>(null)
  // B21 — 노드 편집
  const [showAdd, setShowAdd] = useState(false)
  useEscapeClose(showAdd, () => setShowAdd(false))
  const [form, setForm] = useState({ name: '', symbol: '', address: '' })
  const [editName, setEditName] = useState('')

  const load = async () => {
    const r = await hierarchyService.list(treeType)
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setNodes(r)
  }
  useEffect(() => { void load() }, [treeType]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEditName(sel?.name ?? '') }, [sel])

  const addNode = () => {
    if (!form.name.trim() || !form.address.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>이름·주소를 입력하십시오</span>)
      return
    }
    void sysService.hierarchyAdd({
      treeType, name: form.name.trim(), symbol: form.symbol.trim(),
      address: form.address.trim(), parentAddress: sel?.address ?? '',
    }).then((ok) => {
      if (!ok) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
        return
      }
      setShowAdd(false)
      setForm({ name: '', symbol: '', address: '' })
      void load()
      setStatusMsg(`노드 등록 ✓ — ${form.address} (sys_hierarchy DRAFT, 감사 기록)`)
    }).catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const renameNode = () => {
    if (!sel || !editName.trim() || editName === sel.name) return
    void sysService.hierarchyPatch(sel.id, editName.trim(), '')
      .then((ok) => {
        if (!ok) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>변경 불가 — 백엔드 연결 필요</span>)
          return
        }
        void load()
        setStatusMsg(`노드 개명 ✓ — ${sel.name} → ${editName} (주소 불변, 참조 무결성 유지)`)
      }).catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const deleteNode = () => {
    if (!sel) {
      setStatusMsg(<span style={{ color: 'var(--warn)' }}>삭제 — 노드를 선택하십시오</span>)
      return
    }
    void sysService.hierarchyDelete(sel.id)
      .then((ok) => {
        if (!ok) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>삭제 불가 — 백엔드 연결 필요</span>)
          return
        }
        setSel(null)
        void load()
        setStatusMsg(`노드 삭제 ✓ — ${sel.address}`)
      }).catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('code-hierarchy')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowAdd(true)
    },
    F3: deleteNode,
    F8: () => { void load(); setStatusMsg(`Hierarchy 재조회 — ${treeType} (sys_hierarchy)`) },
  }), [treeType, sel])) // eslint-disable-line react-hooks/exhaustive-deps

  // 트리 렌더 — parentId 기반 들여쓰기
  const depthOf = (n: HierarchyNode): number => {
    let d = 0
    let cur = n
    while (cur.parentId != null) {
      const p = nodes.find((x) => x.id === cur.parentId)
      if (!p) break
      d += 1
      cur = p
    }
    return d
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Tree</label>
        <Combo width={110} value={treeType} options={TREE_TYPES} onChange={setTreeType} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          주소(address)가 Macro(/M/…)·Table(/T/…)·Code(/C/…)의 계층 참조 경로 — 데이터 Table 의 Hierarchy 주소와 동일 체계
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={deleteNode}>{'삭제 F3'}</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('code-hierarchy')}
          title={perm.canWrite('code-hierarchy') ? undefined : perm.denyWrite}
          onClick={() => setShowAdd(true)}>＋ 노드 등록 F2</Btn>
      </div>
      {showAdd ? (
        <div data-hier-add style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>노드 등록 — sys_hierarchy{sel ? ` (상위: ${sel.address})` : ' (최상위)'}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowAdd(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>이름 *</label>
              <input className="in req" value={form.name} aria-label="노드 이름" autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label>Symbol</label>
              <input className="in" value={form.symbol} aria-label="노드 Symbol"
                onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
              <label>주소 *</label>
              <input className="in req" value={form.address} aria-label="노드 주소"
                placeholder={sel ? `${sel.address}/새노드` : '/M'}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'var(--txt-mute)' }}>
              선택 노드가 상위가 됩니다 — 주소는 상위 주소로 시작해야 합니다 (검증됨).
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowAdd(false)}>취소</Btn>
              <Btn variant="pri" onClick={addNode}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`주소 트리 — ${treeType} (${nodes.length})`} noPad style={{ flex: 1 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — Hierarchy 는 실DB(sys_hierarchy)에서만 조회됩니다
            </div>
          ) : (
            <div className="tree2" style={{ padding: 4 }}>
              {nodes.map((n) => (
                <div key={n.id} className={`tn ${sel?.id === n.id ? 'sel' : ''}`}
                  style={{ paddingLeft: 8 + depthOf(n) * 16 }}
                  onClick={() => setSel(n)}>
                  <span className="ico">{n.parentId == null ? '📁' : '▣'}</span>
                  <b style={{ marginRight: 6 }}>{n.symbol}</b>{n.name}
                  <span style={{ marginLeft: 'auto', fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--txt-mute)' }}>
                    {n.address}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GroupBox>
        <div className="split-h" />
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="노드 정보">
            {sel ? (
              <div style={{ fontSize: 11, lineHeight: 2 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="in" value={editName} aria-label="노드 이름 편집"
                    style={{ flex: 1 }} onChange={(e) => setEditName(e.target.value)} />
                  <Btn disabled={!editName.trim() || editName === sel.name} onClick={renameNode}>개명</Btn>
                </div>
                <Chip tone={sel.status === 'APPROVED' ? 'ok' : 'warn'}>{sel.status}</Chip><br />
                Symbol: <span className="code">{sel.symbol}</span><br />
                주소: <Fx>{sel.address}</Fx>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--txt-mute)' }}>노드를 선택하십시오</div>
            )}
          </GroupBox>
          <GroupBox title="참조 예">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.9 }}>
              Macro: <span className="code">/M/ENG/FAN/DIM_B</span><br />
              Table: <span className="code">/T/ENG/VARIANT/Table12</span><br />
              Code: <span className="code">/C/ENG/FAN/KDCR</span><br />
              주소 변경은 참조 무결성 영향 — Platform 승인 대상
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
