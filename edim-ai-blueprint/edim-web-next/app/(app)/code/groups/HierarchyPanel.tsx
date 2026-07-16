'use client'

/** Hierarchy 주소 트리 (M-3-1) — sys_hierarchy 조회·노드 등록/개명/삭제 (N4b 신설). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { addHierarchyNode, deleteHierarchyNode, renameHierarchyNode, type ActState } from './hierarchyActions'

export interface HierarchyNode {
  id: number; parentId: number | null; name: string
  symbol: string; address: string; status: string
}

export function HierarchyPanel({ nodes, treeType }: { nodes: HierarchyNode[]; treeType: string }) {
  const router = useRouter()
  const [regSt, regAction, regPending] = useActionState(addHierarchyNode, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = nodes.find((n) => n.id === selId) ?? null
  const depth = (n: HierarchyNode) => Math.max(0, n.address.split('.').length - 1)

  return (
    <GroupBox title={`Hierarchy 주소 (M-3-1) — ${treeType} · ${nodes.length}노드`} noPad
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', fontSize: 11 }}>
        <label>Tree</label>
        <select className="in" style={{ width: 96 }} value={treeType}
          onChange={(e) => router.push(`/code/groups?tree=${encodeURIComponent(e.target.value)}`)}>
          {['PRODUCT', 'PART', 'DOCUMENT', 'ORG'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="treeType" value={treeType} />
          <input className="in" name="parentAddress" placeholder="상위 주소 (없음=루트)" style={{ width: 116 }} defaultValue={sel?.address ?? ''} key={sel?.address ?? 'root'} />
          <input className="in req" name="address" placeholder="주소 (1.2.3)" style={{ width: 84 }} />
          <input className="in req" name="name" placeholder="노드 이름" style={{ width: 110 }} />
          <input className="in" name="symbol" placeholder="Symbol" style={{ width: 64 }} />
          <button className="b run" type="submit" disabled={regPending}>＋ 노드</button>
        </form>
        <span className="sep" />
        <input className="in" style={{ width: 100 }} placeholder="새 이름 (개명)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="b" disabled={pending || !sel || !newName.trim()} onClick={() => {
          if (sel) start(async () => { setSt(await renameHierarchyNode(sel.id, newName, sel.symbol)); setNewName('') })
        }}>개명</button>
        <button className="b" disabled={pending || !sel} onClick={() => {
          if (sel && confirm(`${sel.address} ${sel.name} 을 삭제하시겠습니까?`))
            start(async () => { setSt(await deleteHierarchyNode(sel.id)); setSelId(null) })
        }}>삭제</button>
        {(regSt.error || st.error) ? <span style={{ color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </div>
      <div className="tree2" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {nodes.length ? nodes.map((n) => (
          <div key={n.id} className={`tn ${n.id === selId ? 'sel' : ''}`}
            style={{ paddingLeft: 6 + depth(n) * 14 }}
            onClick={() => setSelId(n.id)}>
            <span className="ico">▣</span>
            <span className="code" style={{ minWidth: 56 }}>{n.address}</span>
            {n.name}
            {n.symbol ? <span style={{ color: 'var(--txt-mute)' }}> ({n.symbol})</span> : null}
            {n.status !== 'ACTIVE' ? <Chip tone="warn">{n.status}</Chip> : null}
          </div>
        )) : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>노드가 없습니다 — 루트 노드를 등록하십시오</div>}
      </div>
    </GroupBox>
  )
}
