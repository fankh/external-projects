'use client'

/** Hierarchy 주소 트리 (M-3-1) — sys_hierarchy 조회·노드 등록/개명/삭제 (N4b 신설). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, GroupBox } from '@/components/controls'
import { ApprovalStrip } from '@/components/ApprovalStrip'
import { useI18n } from '@/components/I18nProvider'
import { addHierarchyNode, deleteHierarchyNode, getNodeImpact, getNodeInfo, moveHierarchyNode, renameHierarchyNode, updateHierarchyAttrs, validateHierarchy, type ActState, type NodeImpact, type NodeInfo, type ValidateResult } from './hierarchyActions'

export interface HierarchyNode {
  id: number; parentId: number | null; name: string
  symbol: string; address: string; status: string
  remark?: string; color?: string; locked?: boolean
}

const NODE_COLORS = ['', '#C8552F', '#B4820B', '#3E9B57', '#2F6FB4', '#8058A5']

export function HierarchyPanel({ nodes, treeType }: { nodes: HierarchyNode[]; treeType: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [regSt, regAction, regPending] = useActionState(addHierarchyNode, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = nodes.find((n) => n.id === selId) ?? null
  const depth = (n: HierarchyNode) => Math.max(0, n.address.split('.').length - 1)

  // ── U18 편집 심화 — 검색·컨텍스트 메뉴·이동(잘라내기→붙여넣기)·속성 ──
  const [query, setQuery] = useState('')
  const [ctx, setCtx] = useState<{ x: number; y: number; node: HierarchyNode } | null>(null)
  const [cutId, setCutId] = useState<number | null>(null)
  const [info, setInfo] = useState<NodeInfo | null>(null)
  // U22 — 정합 점검 (슬라이드 57-⑧)
  const [vres, setVres] = useState<ValidateResult | null>(null)
  const runValidate = () => start(async () => setVres(await validateHierarchy(treeType)))
  // 트리아지 #22 — 노드 속성 다이얼로그 (Remark/Color/Lock)
  const [attrNode, setAttrNode] = useState<HierarchyNode | null>(null)
  const [attrRemark, setAttrRemark] = useState('')
  const [attrColor, setAttrColor] = useState('')
  const openAttrs = (node: HierarchyNode) => {
    setAttrNode(node); setAttrRemark(node.remark ?? ''); setAttrColor(node.color ?? '')
  }
  const saveAttrs = (locked?: boolean) => attrNode && start(async () => {
    setSt(await updateHierarchyAttrs(attrNode.id, {
      remark: attrRemark, color: attrColor,
      ...(locked === undefined ? {} : { locked }),
    }))
    setAttrNode(null)
  })
  const shown = query.trim()
    ? nodes.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase()) || n.address.includes(query.trim()))
    : nodes
  const openInfo = (id: number) => start(async () => setInfo(await getNodeInfo(id)))
  // 트리아지 #25 — 이동·삭제 전 영향 분석 (사용처)
  const [impact, setImpact] = useState<NodeImpact | null>(null)
  const openImpact = (id: number) => start(async () => setImpact(await getNodeImpact(id)))
  const pasteInto = (target: HierarchyNode | null) => {
    if (cutId == null) return
    start(async () => {
      setSt(await moveHierarchyNode(cutId, target?.id ?? null))
      setCutId(null)
    })
  }

  return (
    <GroupBox title={`${t('hier.title', 'Hierarchy 주소 (M-3-1)')} — ${treeType} · ${nodes.length}${t('hier.nodeUnit', '노드')}`} noPad
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', fontSize: 11 }}>
        <label>Tree</label>
        <select className="in" style={{ width: 96 }} value={treeType}
          onChange={(e) => router.push(`/code/groups?tree=${encodeURIComponent(e.target.value)}`)}>
          {['PRODUCT', 'PART', 'DOCUMENT', 'ORG'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="treeType" value={treeType} />
          <input className="in" name="parentAddress" placeholder={t('hier.parentPh', '상위 주소 (없음=루트)')} style={{ width: 116 }} defaultValue={sel?.address ?? ''} key={sel?.address ?? 'root'} />
          <input className="in req" name="address" placeholder={t('hier.addressPh', '주소 (1.2.3)')} style={{ width: 84 }} />
          <input className="in req" name="name" placeholder={t('hier.namePh', '노드 이름')} style={{ width: 110 }} />
          <input className="in" name="symbol" placeholder="Symbol" style={{ width: 64 }} />
          <button className="b run" type="submit" disabled={regPending}>{t('hier.addNode', '＋ 노드')}</button>
        </form>
        <span className="sep" />
        <input className="in" data-h-search style={{ width: 96 }} placeholder={t('hier.searchPh', '검색 (이름·주소)')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="b" data-h-validate disabled={pending} title={t('hier.validateHint', '저장 전 정합 점검 — 주소 중복·고아 노드·부모 주소 불일치 (57-⑧)')} onClick={runValidate}>{t('hier.validate', '점검')}</button>
        <input className="in" style={{ width: 100 }} placeholder={t('hier.renamePh', '새 이름 (개명)')} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="b" disabled={pending || !sel || !newName.trim()} onClick={() => {
          if (sel) start(async () => { setSt(await renameHierarchyNode(sel.id, newName, sel.symbol)); setNewName('') })
        }}>{t('hier.rename', '개명')}</button>
        <button className="b" disabled={pending || !sel} onClick={() => {
          if (sel && confirm(`${sel.address} ${sel.name} 을 삭제하시겠습니까?`))
            start(async () => { setSt(await deleteHierarchyNode(sel.id)); setSelId(null) })
        }}>{t('common.delete', '삭제')}</button>
        {(regSt.error || st.error) ? <span style={{ color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
        <span className="sep" />
        <ApprovalStrip targetTable="sys_hierarchy" targetId={sel?.id ?? 0}
          targetCode={sel?.address ?? ''} label={`Hierarchy 노드 — ${sel?.address ?? ''} ${sel?.name ?? ''}`}
          status={sel?.status} disabled={!sel} />
      </div>
      {vres ? (
        <div data-h-validate-result style={{ padding: '4px 8px', fontSize: 10.5, borderBottom: '1px solid var(--line)', background: vres.ok ? '#EAF3EC' : '#FBEAEA', maxHeight: 120, overflow: 'auto' }}>
          {vres.ok
            ? <span style={{ color: 'var(--run)' }}>정합 점검 ✓ — {vres.tree} {vres.nodes}노드 이상 없음 (주소 중복·고아·부모 불일치·루트 형식)</span>
            : (<>
                <div style={{ color: 'var(--err)', fontWeight: 700 }}>정합 이상 {vres.issues.length}건 — 수정 후 저장·승인 진행</div>
                {vres.issues.map((iss, i2) => (
                  <div key={i2} style={{ color: 'var(--err)' }}>· [{iss.type}] {iss.address} {iss.name} — {iss.detail}</div>
                ))}
              </>)}
          <span style={{ float: 'right', cursor: 'pointer', color: 'var(--txt-dim)' }} onClick={() => setVres(null)}>✕</span>
        </div>
      ) : null}
      <div className="tree2" style={{ flex: 1, minHeight: 0, overflow: 'auto' }} onClick={() => setCtx(null)}>
        {cutId != null ? (
          <div style={{ padding: '3px 8px', fontSize: 10, background: 'var(--sel-yellow, #FFF3C2)' }}>
            ✂ {nodes.find((n) => n.id === cutId)?.address} 이동 대기 — 대상 노드 우클릭 → 붙여넣기 (루트로: <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); pasteInto(null) }}>여기</span>)
          </div>
        ) : null}
        {shown.length ? shown.map((n) => (
          <div key={n.id} className={`tn ${n.id === selId ? 'sel' : ''}`}
            style={{ paddingLeft: 6 + depth(n) * 14, opacity: n.id === cutId ? 0.5 : 1 }}
            onClick={() => setSelId(n.id)}
            onContextMenu={(e) => { e.preventDefault(); setSelId(n.id); setCtx({ x: e.clientX, y: e.clientY, node: n }) }}>
            <span className="ico" style={n.color ? { color: n.color } : undefined}>▣</span>
            <span className="code" style={{ minWidth: 56 }}>{n.address}</span>
            <span style={n.color ? { color: n.color } : undefined} title={n.remark || undefined}>{n.name}</span>
            {n.symbol ? <span style={{ color: 'var(--txt-mute)' }}> ({n.symbol})</span> : null}
            {n.locked ? <span title="잠금 — 수정·이동·삭제 보호" style={{ marginLeft: 3 }}>🔒</span> : null}
            {n.remark ? <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, marginLeft: 4 }}>✎ {n.remark.slice(0, 24)}{n.remark.length > 24 ? '…' : ''}</span> : null}
            {n.status !== 'ACTIVE' ? <Chip tone="warn">{n.status}</Chip> : null}
          </div>
        )) : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{query ? '검색 결과 없음' : '노드가 없습니다 — 루트 노드를 등록하십시오'}</div>}
      </div>
      {/* U18 — 컨텍스트 메뉴 (슬라이드 64) */}
      {ctx ? (
        <div data-h-ctx style={{ position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 200, background: '#fff',
          border: '1px solid var(--line-strong)', boxShadow: '0 4px 12px rgba(20,26,40,.25)', fontSize: 11, minWidth: 130 }}
          onClick={(e) => e.stopPropagation()}>
          {[
            { label: '✂ 잘라내기 (이동)', act: () => { setCutId(ctx.node.id); setCtx(null) } },
            ...(cutId != null && cutId !== ctx.node.id ? [{ label: '📥 여기에 붙여넣기', act: () => { pasteInto(ctx.node); setCtx(null) } }] : []),
            { label: 'ℹ 속성·정보', act: () => { openInfo(ctx.node.id); setCtx(null) } },
            { label: '🔎 영향 분석 (사용처)', act: () => { openImpact(ctx.node.id); setCtx(null) } },
            { label: '🎨 속성 편집 (비고·색·잠금)', act: () => { openAttrs(ctx.node); setCtx(null) } },
            { label: ctx.node.locked ? '🔓 잠금 해제' : '🔒 잠금', act: () => { setCtx(null); start(async () => setSt(await updateHierarchyAttrs(ctx.node.id, { locked: !ctx.node.locked }))) } },
            { label: '🗑 삭제', act: () => { setCtx(null); if (confirm(`${ctx.node.address} ${ctx.node.name} 을 삭제하시겠습니까?`)) start(async () => { setSt(await deleteHierarchyNode(ctx.node.id)); setSelId(null) }) } },
          ].map((m) => (
            <div key={m.label} style={{ padding: '5px 12px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF2FA' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
              onClick={m.act}>{m.label}</div>
          ))}
        </div>
      ) : null}
      {/* 트리아지 #22 — 속성 편집 다이얼로그 (Remark·Color·Lock) */}
      {attrNode ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAttrNode(null)}>
          <div className="gb" data-h-attrs style={{ width: 320, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>
              {t('hier.attrTitle', '속성 편집')} — {attrNode.address} {attrNode.name} {attrNode.locked ? '🔒' : ''}
            </div>
            <div className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('hier.remark', '비고')}</label>
              <input className="in" aria-label="노드 비고" value={attrRemark} maxLength={200}
                onChange={(e) => setAttrRemark(e.target.value)} autoFocus />
              <label>{t('hier.color', '색상')}</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {NODE_COLORS.map((c) => (
                  <span key={c || 'none'} onClick={() => setAttrColor(c)}
                    title={c || t('hier.colorNone', '기본')}
                    style={{ width: 18, height: 18, borderRadius: 3, cursor: 'pointer',
                      background: c || '#fff', border: attrColor === c ? '2px solid var(--title-navy)' : '1px solid var(--line)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
                    {c ? '' : '∅'}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button className="b" data-h-attr-lock onClick={() => saveAttrs(!attrNode.locked)}
                title={t('hier.lockHint', '잠금 노드는 수정·이동·삭제가 409 로 보호됩니다')}>
                {attrNode.locked ? '🔓 ' + t('hier.unlock', '해제+저장') : '🔒 ' + t('hier.lock', '잠금+저장')}</button>
              <button className="b run" data-h-attr-save disabled={pending} onClick={() => saveAttrs()}>{t('common.save', '저장')}</button>
              <button className="b" onClick={() => setAttrNode(null)}>{t('common.cancel', '취소')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {/* 트리아지 #25 — 영향 분석 다이얼로그 (이동·삭제 전 사용처 확인) */}
      {impact ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setImpact(null)}>
          <div className="gb" data-h-impact style={{ width: 360, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>
              {t('hier.impactTitle', '영향 분석')} — {impact.address} {impact.name}
            </div>
            <div style={{ color: 'var(--txt-mute)' }}>
              {t('hier.impactHint', '이동 시 참조 자산 주소는 자동 연결 유지, 참조가 있으면 삭제는 차단됩니다')}
            </div>
            <div>
              {t('hier.descendants', '하위 노드')} <b>{impact.descendants}</b> ·{' '}
              {t('hier.refTotal', '참조 자산')} <b style={{ color: impact.referencingTotal ? 'var(--err)' : 'var(--run)' }}>{impact.referencingTotal}</b>{t('detail.cases', '건')}
            </div>
            {impact.references.length ? (
              <table className="g" style={{ width: '100%' }}><tbody>
                {impact.references.map((r) => (
                  <tr key={r.table}>
                    <td style={{ width: 90, color: 'var(--txt-mute)' }}>{r.label}</td>
                    <td style={{ width: 40, textAlign: 'right' }}>{r.count}</td>
                    <td style={{ color: 'var(--txt-mute)' }}>{r.samples.join(', ')}{r.count > r.samples.length ? ' …' : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            ) : <div style={{ color: 'var(--run)' }}>{t('hier.noRefs', '참조 자산 없음 — 안전하게 이동·삭제할 수 있습니다')}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="b" onClick={() => setImpact(null)}>{t('common.close', '닫기')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {/* U18 — 속성/정보 다이얼로그 */}
      {info ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setInfo(null)}>
          <div className="gb" data-h-info style={{ width: 320, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>노드 속성 — {info.name}</div>
            <table className="g" style={{ width: '100%' }}><tbody>
              {[['주소', info.address], ['트리', info.treeType], ['심볼', info.symbol || '—'],
                ['상태', info.status], ['시스템 제공', info.isSystem ? '예 (편집 제한)' : '아니오'],
                ['하위 노드', String(info.descendants)], ['작성', `${info.createdBy} · ${info.createdAt}`],
                ['수정', info.updatedAt || '—'], ['비고', info.remarks || '—']].map(([k, v]) => (
                <tr key={k}><td style={{ width: 84, color: 'var(--txt-mute)' }}>{k}</td><td>{v}</td></tr>
              ))}
            </tbody></table>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="b" onClick={() => setInfo(null)}>닫기</button>
            </div>
          </div>
        </div>
      ) : null}
    </GroupBox>
  )
}
