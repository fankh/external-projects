'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { Cvs } from '@/components/Cvs'
import type { CanvasBlock } from '@/lib/cadTypes'
import { useRouter } from 'next/navigation'
import { CadSvg } from '@/components/CadSvg'
import { downloadCsv } from '@/lib/csv'
import type { CadDocument } from '@/lib/cadTypes'
import { relationshipCad, runningTest, addChild, deleteRelationship, requestApproval, type RunningTestRow, addSlotMap, delSlotMap, getSlotMap, type SlotMapView } from './actions'

export interface ChildRow { code: string; desc: string; qty: number; remarks: string; slotMap?: string
  relId?: number; slotMapCount?: number; revisionNo?: number }
interface Mother { code: string; desc: string; slots: { slot: string; label: string; values: string }[] }

const SLOT_OPTS: Record<string, string[]> = { B: ['13', '21', '32'], C: ['32', '45'], E: ['15', '21'] }

function SlotMapEditor({ children }: { children: ChildRow[] }) {
  const { t } = useI18n()
  const mapped = children.filter((c) => c.relId)
  const [relId, setRelId] = useState<number>(mapped[0]?.relId ?? 0)
  const [view, setView] = useState<SlotMapView | null>(null)
  const [childSlot, setChildSlot] = useState('')
  const [motherSlot, setMotherSlot] = useState('')
  const [fixed, setFixed] = useState('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [busy, run] = useTransition()

  const load = (id: number) => run(async () => { setView(await getSlotMap(id)) })
  useEffect(() => { if (relId) load(relId) }, [relId])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!mapped.length) return null
  return (
    <div className="gb" style={{ padding: 6 }} data-slotmap-editor>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
        {t('codrel.slotMapTitle', 'Slot 매핑 — Mother 선택조건 → Child 전개 기준 (#29)')}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 10.5 }}>
        <select className="in" data-sm-rel value={relId} onChange={(e) => setRelId(Number(e.target.value))}
          style={{ height: 22, width: 190 }}>
          {mapped.map((c) => (
            <option key={c.relId} value={c.relId}>
              {c.code} {c.slotMapCount ? `(${c.slotMapCount})` : `(0 — ${t('codrel.undefined', '미정의')})`}
            </option>
          ))}
        </select>
        <select className="in" data-sm-child value={childSlot} onChange={(e) => setChildSlot(e.target.value)}
          style={{ height: 22, width: 108 }}>
          <option value="">{t('codrel.childSlot', 'Child Slot')}</option>
          {(view?.childSlots ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span>←</span>
        <select className="in" data-sm-mother value={motherSlot}
          onChange={(e) => { setMotherSlot(e.target.value); if (e.target.value) setFixed('') }}
          style={{ height: 22, width: 118 }}>
          <option value="">{t('codrel.motherSlot', 'Mother Slot 계승')}</option>
          {(view?.motherSlots ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ color: 'var(--txt-mute)' }}>{t('common.or', '또는')}</span>
        <input className="in" data-sm-fixed value={fixed} placeholder={t('codrel.fixedValue', '고정값')}
          onChange={(e) => { setFixed(e.target.value); if (e.target.value) setMotherSlot('') }}
          style={{ height: 22, width: 92 }} />
        <button className="b run" data-sm-add disabled={busy || !relId || !childSlot}
          onClick={() => run(async () => {
            const r = await addSlotMap(relId, childSlot, motherSlot, fixed)
            setMsg(r); if (r.ok) { setChildSlot(''); setMotherSlot(''); setFixed(''); setView(await getSlotMap(relId)) }
          })} style={{ height: 22 }}>{t('codrel.mapAdd', '＋ 매핑')}</button>
        {msg.error ? <span style={{ color: 'var(--err)' }} data-sm-err>{msg.error}</span> : null}
        {msg.ok ? <span style={{ color: 'var(--run)' }}>{msg.ok}</span> : null}
      </div>
      <table className="g" style={{ marginTop: 4 }}>
        <thead><tr>
          <th style={{ width: 96 }}>Child Slot</th><th>{t('codrel.source', '값 출처')}</th><th style={{ width: 36 }} />
        </tr></thead>
        <tbody>
          {view?.maps.length ? view.maps.map((m) => (
            <tr key={m.slotMapId} data-sm-row={m.childSlot}>
              <td className="code">{m.childSlot}</td>
              <td>{m.motherSlot
                ? `${t('codrel.inherit', 'Mother')} ${m.motherSlot}`
                : `${t('codrel.fixed', '고정')} "${m.fixedValue}"`}</td>
              <td className="c">
                <button className="b" data-sm-del aria-label={t('common.delete', '삭제')} disabled={busy} onClick={() => run(async () => {
                  const r = await delSlotMap(relId, m.slotMapId)
                  setMsg(r); setView(await getSlotMap(relId))
                })}>✕</button>
              </td>
            </tr>
          )) : (
            <tr><td colSpan={3} style={{ padding: 8, color: 'var(--txt-mute)', fontSize: 10.5 }}>
              {t('codrel.noMap', '매핑 없음 — Child 슬롯이 빈 채 전개됩니다')}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function RelationshipView({ mother, children }: { mother: Mother; children: ChildRow[] }) {
  const { t } = useI18n()
  const router = useRouter()
  // U20 — 구성 실도면 미리보기 (CAD 토글)
  const [cadMode, setCadMode] = useState(false)
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(null)
  const [cadOffline, setCadOffline] = useState(false)
  const toggleCad = () => {
    const next = !cadMode
    setCadMode(next)
    if (next && cadDoc === null && !cadOffline) {
      void relationshipCad().then((d) => { if (d === null) setCadOffline(true); else setCadDoc(d) })
    }
  }
  const [checked, setChecked] = useState<Set<string>>(new Set(children.map((c) => c.code)))
  const [slots, setSlots] = useState<Record<string, string>>({ B: '13', C: '32', E: '15' })
  const [testRows, setTestRows] = useState<RunningTestRow[] | null>(null)
  const [tested, setTested] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addQty, setAddQty] = useState('1')
  // 세션 내 추가된 DRAFT 관계 — 승인 전 회수(삭제) 대상 (DELETE /codes/relationships/{relId})
  const [drafts, setDrafts] = useState<{ relId: number; child: string; qty: number }[]>([])
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const relBlocks = useMemo<CanvasBlock[]>(() => {
    const blocks: CanvasBlock[] = [{ id: 'm', name: 'Mother', sub: mother.code, x: 200, y: 12, w: 150, h: 60 }]
    children.slice(0, 8).forEach((c, i) => {
      blocks.push({ id: c.code, name: 'Child', sub: c.code, x: 20 + i * 130, y: 130, w: 118, h: 52, dashed: !checked.has(c.code) })
    })
    return blocks
  }, [children, checked, mother.code])
  const relDims = useMemo(() => (children.length
    ? [{ x: 20, y: 205, w: Math.max(150, Math.min(children.length, 8) * 130 - 12), label: `Child ${Math.min(children.length, 8)}` }] : []), [children])

  const toggle = (code: string) => {
    setChecked((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
    setTested(false)
  }
  const runTest = () => start(async () => {
    const r = await runningTest(mother.code, slots, [...checked])
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setTestRows(r.rows ?? []); setTested(true)
    setMsg({ text: `Running Test ✓ — ${(r.rows?.length ?? 1) - 1} Child 전개 (순환 참조 없음, CODE-009)` })
  })
  const doAdd = () => start(async () => {
    const r = await addChild(mother.code, addCode, Number(addQty) || 1)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    if (r.relId) setDrafts((d) => [...d, { relId: r.relId!, child: addCode, qty: Number(addQty) || 1 }])
    setMsg({ text: `Child 추가 ✓ — ${mother.code} → ${addCode} ×${addQty} (DRAFT #${r.relId}, Running Test 후 승인)` })
    setAddCode('')
  })
  const doDeleteDraft = (relId: number) => start(async () => {
    const r = await deleteRelationship(relId)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setDrafts((d) => d.filter((x) => x.relId !== relId))
    setMsg({ text: `DRAFT 관계 #${relId} 삭제 ✓ (승인 전 회수)` })
  })
  const doApprove = () => start(async () => {
    const r = await requestApproval(mother.code, testRows ? testRows.length - 1 : 0)
    setMsg(r.error ? { text: r.error, err: true } : { text: `승인 요청 ✓ — ${mother.code} 관계 (승인함 등록 · 승인 시 APPROVED 전이)` })
  })

  const childCols: GridColumn<ChildRow>[] = [
    { key: 'chk', header: '☑', width: 26, align: 'center', render: (r) => <input type="checkbox" checked={checked.has(r.code)} aria-label={`선택 ${r.code}`} onChange={() => toggle(r.code)} /> },
    { key: 'code', header: 'Child', width: 74, code: true, render: (r) => r.code },
    { key: 'desc', header: 'Desc.', render: (r) => r.desc },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 120, render: (r) => r.remarks },
    { key: 'data', header: 'Data', width: 54, align: 'center', noSort: true, noFilter: true,
      render: (r) => (
        <span data-child-links style={{ display: 'inline-flex', gap: 4 }}>
          <span title={t('codrel.openDetail', '코드 상세 (Tech·Variant·도면)')} style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); router.push(`/detail/code?code=${encodeURIComponent(r.code)}`) }}>📄</span>
        </span>
      ) },
  ]
  const testCols: GridColumn<RunningTestRow>[] = [
    { key: 'no', header: 'No.', width: 36, align: 'center', render: (r) => r.no },
    { key: 'name', header: 'Name', code: true, render: (r) => r.name },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 110, render: (r) => r.remarks },
  ]

  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
      <div className="fill-col" style={{ gap: 6, flex: 1.15, overflow: 'auto' }}>
        <div className="gb">
          <div style={{ fontSize: 11, padding: '3px 6px' }}>Mother : <b style={{ color: 'var(--err)' }}>{mother.code}</b> <span style={{ color: 'var(--txt-dim)' }}>{mother.desc}</span></div>
          <table className="g"><thead><tr>{mother.slots.map((s) => <th key={s.slot}>{s.slot} : {s.label}</th>)}</tr></thead>
            <tbody><tr>{mother.slots.map((s) => <td key={s.slot} className="code">{s.values}</td>)}</tr></tbody></table>
        </div>
        <div className="gb">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{t('codrel.diagram', '구성도 — Mother · Child')}</span>
            <button className={`b ${cadMode ? '' : 'pri'}`} style={{ height: 18, fontSize: 9.5 }} onClick={() => cadMode && toggleCad()}>{t('cpq.block', '블록')}</button>
            <button className={`b ${cadMode ? 'pri' : ''}`} data-rel-cad style={{ height: 18, fontSize: 9.5 }} onClick={() => !cadMode && toggleCad()}>CAD</button>
          </div>
          <div style={{ height: 230 }}>
            {cadMode
              ? (cadDoc ? <CadSvg doc={cadDoc} /> : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11 }}>{cadOffline ? t('cpq.cadOffline', 'CAD 서버 연결 실패') : t('cpq.drawing', '작도 중…')}</div>)
              : <Cvs blocks={relBlocks} dims={relDims} style={{ width: '100%', height: '100%' }} />}
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.7, padding: '3px 6px' }}>{t('codrel.slotMapHint', 'Slot 매핑(slot_map)으로 Mother 값이 Child 코드 자릿수에 전파 (CODE-008)')}</div>
        </div>
        {/* #29 — Mother 선택조건 → Child 전개 기준. 이 매핑이 없으면 Child 슬롯이 빈 채 전개된다 */}
        <SlotMapEditor children={children} />
        <div className="gb" style={{ padding: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Add Child</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="in" value={addCode} placeholder={t('rel.addCodePh', '예: KDI 21')} aria-label="Child Code" onChange={(e) => setAddCode(e.target.value)} style={{ height: 22, fontSize: 11, width: 130 }} />
            <input className="in" value={addQty} aria-label="Qty" onChange={(e) => setAddQty(e.target.value)} style={{ height: 22, fontSize: 11, width: 56 }} />
            <button className="b" disabled={pending} onClick={doAdd} style={{ height: 22, fontSize: 11 }}>＋ Add</button>
          </div>
          {drafts.length ? (
            <div data-rel-drafts style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: 10.5 }}>
              <span style={{ color: 'var(--txt-dim)' }}>{t('rel.draftLabel', 'DRAFT (승인 전 — ✕ 회수)')}</span>
              {drafts.map((d) => (
                <span key={d.relId} className="st info" style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                  #{d.relId} {d.child} ×{d.qty}
                  <span data-rel-draft-del style={{ cursor: 'pointer', fontWeight: 700 }}
                    title={t('rel.draftDelHint', 'DRAFT 관계 삭제 (승인 관계는 보호)')}
                    onClick={() => !pending && doDeleteDraft(d.relId)}>✕</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
        <div className="gb" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 260 }}>
          <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>[ Child Group ]</div>
          <div style={{ flex: 1, minHeight: 0 }}><DenseGrid columns={childCols} rows={children} rowKey={(r) => r.code} /></div>
        </div>
        <div className="gb" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 6px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>[ Part List Running Test ]</span>
            {Object.entries(SLOT_OPTS).map(([s, opts]) => (
              <select key={s} className="in" value={slots[s]} onChange={(e) => { setSlots((p) => ({ ...p, [s]: e.target.value })); setTested(false) }} style={{ height: 20, fontSize: 10 }}>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            <button className="b" disabled={pending} onClick={runTest} style={{ height: 20, fontSize: 10 }} title={t('codrel.ebomHint', 'EBOM Run — BOM 관련만 전개 (슬라이드 70)')}>EBOM Run ▶</button>
            <button className="b" data-ebom-export disabled={!testRows?.length} style={{ height: 20, fontSize: 10 }}
              onClick={() => testRows && downloadCsv(`ebom-${mother.code}`,
                ['No', 'Name', 'Qty', 'Remarks'], testRows.map((r) => [r.no, r.name, r.qty, r.remarks]))}>⬇ CSV</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {testRows ? <DenseGrid columns={testCols} rows={testRows} rowKey={(r) => r.no} />
              : <div style={{ padding: 10, color: 'var(--txt-mute)', fontSize: 11 }}>{t('codrel.runHint', 'Mother Slot 조합(B·C·E)을 선택하고 Run — 조건 일치 Child 전량 전개 검증')}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          {tested ? <Chip tone="ok">{t('codrel.testPassed', 'Running Test 통과')}</Chip> : <Chip tone="warn">{t('codrel.testNeeded', 'Test 필요')}</Chip>}
          <button className="b" disabled={!tested || pending} onClick={doApprove} style={{ height: 22, fontSize: 11 }}>{t('common.requestApproval', '승인 요청')}</button>
        </div>
      </div>
      {msg ? <div style={{ position: 'fixed', bottom: 8, left: 230, fontSize: 11, padding: '4px 10px', background: msg.err ? '#FBEAEA' : '#EAF3EC', color: msg.err ? 'var(--err)' : 'var(--run)', border: '1px solid var(--line)', borderRadius: 3 }}>{msg.text}</div> : null}
    </div>
  )
}
