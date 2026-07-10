/** M-3-1 Hierarchy 주소 체계 (B14) — sys_hierarchy 트리 조회.
 *  /C(코드)·/M(Macro)·/T(Table) 주소가 tbx_macro·tbl 의 hierarchy_address 원천. */
import { useEffect, useMemo, useState } from 'react'
import { hierarchyService, type HierarchyNode } from '../../api/services'
import { Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TREE_TYPES = ['PRODUCT', 'GENERAL_DB', 'CONFIG']

export function HierarchyScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [treeType, setTreeType] = useState('PRODUCT')
  const [nodes, setNodes] = useState<HierarchyNode[]>([])
  const [offline, setOffline] = useState(false)
  const [sel, setSel] = useState<HierarchyNode | null>(null)

  const load = async () => {
    const r = await hierarchyService.list(treeType)
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setNodes(r)
  }
  useEffect(() => { void load() }, [treeType]) // eslint-disable-line react-hooks/exhaustive-deps

  useFKeys(active, useMemo(() => ({
    F8: () => { void load(); setStatusMsg(`Hierarchy 재조회 — ${treeType} (sys_hierarchy)`) },
  }), [treeType])) // eslint-disable-line react-hooks/exhaustive-deps

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
      </div>
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
                <b>{sel.name}</b> <Chip tone={sel.status === 'APPROVED' ? 'ok' : 'warn'}>{sel.status}</Chip><br />
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
