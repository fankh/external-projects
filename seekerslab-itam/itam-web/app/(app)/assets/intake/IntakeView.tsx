'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { ASSET_CATEGORIES } from '@/lib/types'
import type { AssetCategory, IntakeLot } from '@/lib/types'
import { cancelPreRegisteredLot, closeReturnedLot, issueAssetNo, markLotArrived, preRegisterLot, reinspectIntakeLot, registerIntakeLot, rejectIntakeLot, remindIntakeOverdue, toggleCheck } from './actions'

interface Label { assetNo: string; model: string; qr: string; barcode: string }
interface PC { id: string; name: string; vendor: string }

const STATUS_TONE = { '도입 예정': 'info', '입고 대기': 'neutral', '검수 중': 'warn', '검수 완료': 'ok', '검수 반려': 'err', '반품 완료': 'neutral' } as const
// 자산 유형 목록은 lib/types 의 ASSET_CATEGORIES 하나만 쓴다 — 여기에 다시 적으면 유형이 하나 늘 때
//  대장 필터·집계는 새 유형을 아는데 이 화면의 드롭다운·업로드 검증만 옛 목록이라 등록이 막힌다.

/** 도입 예정 입고 지연 경과일 — 도착 예정일 대비 기준일(YYYY-MM-DD 파싱, Date.now 미사용) */
function intakeLateDays(expectedDate: string | undefined, today: string): number {
  if (!expectedDate) return 0
  return Math.floor((Date.parse(today) - Date.parse(expectedDate)) / 86_400_000)
}

export function IntakeView({ lots, labels, contracts, today, remindCount = 0, initialFilter }: { lots: IntakeLot[]; labels: Label[]; contracts: PC[]; today: string; remindCount?: number; /** 대시보드 입고 큐의 드릴다운 — 검수 대기·검수 반려만 보기로 연다 */ initialFilter?: 'inspect' | 'rejected' | 'overdue' }) {
  // 도입 예정(사전 등록) 건과 실제 입고 건을 분리한다 — 도입 예정은 아직 검수 대상이 아니다
  const plannedLots = lots.filter((l) => l.status === '도입 예정')
  const arrivedLots = lots.filter((l) => l.status !== '도입 예정')
  const [selId, setSelId] = useState(arrivedLots[0]?.id ?? '')
  // 대시보드 '입고 검수 대기'·'검수 반려' 큐의 드릴다운 — 입고 목록은 검수 완료·반품까지 함께 쌓이므로,
  //  큐가 말한 건수를 화면에서 다시 세어야 했다. 판정은 큐와 같은 상태값을 쓴다.
  const [lotFilter, setLotFilter] = useState<'전체' | 'inspect' | 'rejected'>(initialFilter === 'overdue' ? '전체' : (initialFilter ?? '전체'))
  // 지연만 보기 — 대시보드 '도입 예정 입고 지연' 큐의 드릴다운. 이 큐가 세는 로트는 아래 검수 표가 아니라
  //  '도입 예정' 표에 살아 있어, 검수 필터(?lot=inspect·rejected)로는 좁혀지지 않았다. 도착 예정일이 남은
  //  로트까지 함께 쌓이는 표라 큐가 말한 건수를 화면에서 다시 세어야 했다.
  const [plannedOverdueOnly, setPlannedOverdueOnly] = useState(initialFilter === 'overdue')
  const plannedOverdueCount = plannedLots.filter((l) => intakeLateDays(l.expectedDate, today) > 0).length
  const shownPlanned = plannedOverdueOnly ? plannedLots.filter((l) => intakeLateDays(l.expectedDate, today) > 0) : plannedLots
  const inspectCount = arrivedLots.filter((l) => l.status === '입고 대기' || l.status === '검수 중').length
  const rejectedCount = arrivedLots.filter((l) => l.status === '검수 반려').length
  const shownLots = lotFilter === 'inspect' ? arrivedLots.filter((l) => l.status === '입고 대기' || l.status === '검수 중')
    : lotFilter === 'rejected' ? arrivedLots.filter((l) => l.status === '검수 반려')
    : arrivedLots
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  // 입고 등록 폼
  const [regOpen, setRegOpen] = useState(false)
  const [rc, setRc] = useState(contracts[0]?.id ?? '')
  const [rmodel, setRmodel] = useState('')
  const [rcat, setRcat] = useState<AssetCategory>('단말')
  const [rqty, setRqty] = useState('1')
  const [runit, setRunit] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rjReason, setRjReason] = useState('')
  // 도입 예정 사전 등록 폼 (ITSM SR·발주)
  const [preOpen, setPreOpen] = useState(false)
  const [pc, setPc] = useState(contracts[0]?.id ?? '')
  const [psr, setPsr] = useState('')
  const [pmodel, setPmodel] = useState('')
  const [pcat, setPcat] = useState<AssetCategory>('단말')
  const [pqty, setPqty] = useState('1')
  const [punit, setPunit] = useState('')
  const [pdate, setPdate] = useState('')
  const registerLot = () => {
    startTransition(async () => {
      const r = await registerIntakeLot(rc, rmodel, rcat, Number(rqty), Number(runit || 0))
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) { setRegOpen(false); setRmodel(''); setRqty('1') }
    })
  }
  const preRegister = () => startTransition(async () => {
    const r = await preRegisterLot({ contractId: pc, srNo: psr, model: pmodel, category: pcat, qty: Number(pqty), expectedDate: pdate, unitCost: Number(punit || 0) })
    setMsg({ ok: r.ok, text: r.message })
    if (r.ok) { setPreOpen(false); setPsr(''); setPmodel(''); setPqty('1'); setPdate('') }
  })
  const markArrived = (id: string) => startTransition(async () => {
    const r = await markLotArrived(id)
    setMsg({ ok: r.ok, text: r.message })
  })
  const cancelPlanned = (id: string) => startTransition(async () => {
    const r = await cancelPreRegisteredLot(id)
    setMsg({ ok: r.ok, text: r.message })
  })
  const sel = arrivedLots.find((l) => l.id === selId) ?? arrivedLots[0]
  const selLabels = labels.filter((l) => sel?.issued.includes(l.assetNo))
  const done = sel ? sel.checklist.filter((c) => c.checked).length : 0
  // 체크리스트 조작 가능 여부 — 서버(toggleCheck)와 같은 판정. 반려·반품 로트는 재검수 전까지, 채번이 시작된
  //  로트는 영구히 잠긴다. 화면이 이 판정을 몰라 눌리는 체크박스를 계속 내주면 눌러도 아무 일이 없는
  //  '조용한 거절'이 된다(막다른 컨트롤 방지 규약).
  const checkLock = !sel ? null
    : ['검수 반려', '반품 완료'].includes(sel.status) ? `${sel.status} 로트 — 재검수로 입고 대기에 되돌린 뒤 체크리스트를 진행합니다.`
    : sel.issued.length > 0 ? `${sel.issued.length}건 채번 완료 — 검수 결과를 되돌릴 수 없습니다.`
    : null

  return (
    <>
      {msg?.text && <div className={`callout ${msg.ok ? '' : 'warn'}`}>{msg.text}</div>}

      <Card kicker="ITSM · Procurement" title={`도입 예정 — ITSM SR·발주 연계 ${plannedLots.length > 0 ? `(${plannedLots.length})` : ''}`} pad={false}
        actions={<span className="hstack" style={{ gap: 6 }}>
          {/* 버튼 건수는 '오늘 아직 안 보낸' 대상 수(lib/reminders · 액션과 같은 소스) — 표의 납기 경과 배지(신호)와 집합이 다르다 */}
          {remindCount > 0 && (
            <button className="btn sm" disabled={pending}
              title="도착 예정일이 지난 발주 로트의 공급사(발주처)에 납기 확인을 독촉합니다 (발송 이력·감사)"
              onClick={() => startTransition(async () => { const r = await remindIntakeOverdue(); setMsg({ ok: r.ok, text: r.message }) })}>
              입고 지연 독촉 발송 {remindCount}건
            </button>
          )}
          {contracts.length > 0 && <button className="btn sm pri" disabled={pending} onClick={() => { setPreOpen((o) => !o); setMsg(null) }}>{preOpen ? '취소' : '＋ 도입 예정 등록'}</button>}
        </span>}>
        {preOpen && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 14, borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
            <span className="dim" style={{ fontSize: 11.5, fontWeight: 600 }}>SR·발주 사전 등록</span>
            <input className="input" style={{ width: 150 }} placeholder="SR·발주번호 (예: SR-2607-018)" value={psr} disabled={pending} onChange={(e) => setPsr(e.target.value)} />
            <select aria-label="도입 예정 계약" className="select" value={pc} disabled={pending} onChange={(e) => setPc(e.target.value)}>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name} ({c.vendor})</option>)}
            </select>
            <input className="input" style={{ width: 180 }} placeholder="모델" value={pmodel} disabled={pending} onChange={(e) => setPmodel(e.target.value)} />
            <select aria-label="도입 예정 자산 유형" className="select" value={pcat} disabled={pending} onChange={(e) => setPcat(e.target.value as AssetCategory)}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" type="number" min={1} max={1000} style={{ width: 76 }} value={pqty} disabled={pending} onChange={(e) => setPqty(e.target.value)} />
            <input className="input" type="number" min={0} style={{ width: 110 }} placeholder="발주 단가(원)" value={punit} disabled={pending} onChange={(e) => setPunit(e.target.value)} />
            <label className="hstack" style={{ gap: 4, fontSize: 12 }}>도착 예정
              <input className="input" type="date" style={{ width: 150 }} value={pdate} disabled={pending} onChange={(e) => setPdate(e.target.value)} />
            </label>
            <button className="btn sm pri" disabled={pending || !psr.trim() || !pmodel.trim() || !pdate} onClick={preRegister}>등록</button>
          </div>
        )}
        {plannedLots.length > 0 && (
          <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`btn sm ${plannedOverdueOnly ? 'err' : 'ghost'}`} onClick={() => setPlannedOverdueOnly((v) => !v)}
              title="도착 예정일이 지난 발주 로트만 — 대시보드 '도입 예정 입고 지연' 큐와 같은 집합">
              {plannedOverdueOnly ? '✓ ' : ''}지연만 {plannedOverdueCount}
            </button>
            <span className="mut" data-queue="lot=overdue" style={{ fontSize: 12 }}>{shownPlanned.length} / {plannedLots.length}건</span>
          </div>
        )}
        {shownPlanned.length === 0 ? (
          <div className="empty">{plannedLots.length === 0 ? '도입 예정 자산이 없습니다 — ITSM SR·발주 정보로 도착 전 자산을 사전 등록하면 여기에 표시됩니다.' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>입고번호</th><th>SR·발주</th><th>계약</th><th>모델</th><th>공급사</th><th className="num">수량</th><th>도착 예정</th><th className="c">납기</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {shownPlanned.map((l) => {
                  const late = intakeLateDays(l.expectedDate, today)
                  return (
                  <tr key={l.id}>
                    <td className="code">{l.id}</td>
                    <td className="code">{l.srNo}</td>
                    <td className="code">{l.contractId}</td>
                    <td className="strong">{l.model}</td>
                    <td className="mute">{l.vendor}</td>
                    <td className="num">{l.qty}</td>
                    <td className="tnum">{l.expectedDate}</td>
                    <td className="c">{late > 0 ? <Chip tone="err">입고 지연 D+{late}</Chip> : <Chip tone="ok" bare>정상</Chip>}</td>
                    <td className="c" style={{ whiteSpace: 'nowrap' }}>
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm pri" disabled={pending} onClick={() => markArrived(l.id)}
                          title="실제 도착 처리 — 입고 대기로 전환해 검수 대기열에 편성">입고 등록 (도착)</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => cancelPlanned(l.id)}
                          title="발주·SR 취소 — 도착 전 도입 예정 건을 파이프라인에서 제외(입고 지연 오알림 방지)">취소</button>
                      </span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        <div className="callout" style={{ margin: 14 }}>
          <b>ITSM·구매 연계 사전 등록.</b> SR·발주 정보로 <b>도착 전</b> 자산을 미리 등록해 두면, 실제 도착 시 <b>입고 등록(도착)</b> 한 번으로
          검수 대기열에 편입됩니다(이후 검수 → 채번 → 대장). 도입 예정 단계에서는 아직 검수·채번 대상이 아닙니다.
        </div>
      </Card>

      <Card kicker="Arrivals" title="입고 목록" pad={false}
        actions={contracts.length > 0
          ? <button className="btn sm pri" disabled={pending} onClick={() => { setRegOpen((o) => !o); setMsg(null) }}>{regOpen ? '취소' : '입고 등록'}</button>
          : undefined}>
        {regOpen && (
          <div className="addrow" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 14, borderBottom: '1px solid var(--line)' }}>
            <span className="dim" style={{ fontSize: 11.5, fontWeight: 600 }}>발주 연계 입고 등록</span>
            <select aria-label="입고 등록 계약" className="select" value={rc} disabled={pending} onChange={(e) => setRc(e.target.value)}>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name} ({c.vendor})</option>)}
            </select>
            <input className="input" style={{ width: 190 }} placeholder="모델 (예: ThinkPad T14 Gen4)" value={rmodel} disabled={pending} onChange={(e) => setRmodel(e.target.value)} />
            <select aria-label="입고 등록 자산 유형" className="select" value={rcat} disabled={pending} onChange={(e) => setRcat(e.target.value as AssetCategory)}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" type="number" min={1} max={1000} style={{ width: 80 }} value={rqty} disabled={pending} onChange={(e) => setRqty(e.target.value)} />
            <input className="input" type="number" min={0} style={{ width: 110 }} placeholder="발주 단가(원)" value={runit} disabled={pending} onChange={(e) => setRunit(e.target.value)} />
            <button className="btn sm pri" disabled={pending || !rmodel.trim() || !rc} onClick={registerLot}>등록</button>
            <span className="mut" style={{ fontSize: 11 }}>등록 즉시 ‘입고 대기’로 검수 대기열에 편성됩니다.</span>
          </div>
        )}
        {(inspectCount > 0 || rejectedCount > 0) && (
          <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            {([['전체', arrivedLots.length], ['inspect', inspectCount], ['rejected', rejectedCount]] as const).map(([k, n]) => (
              <button key={k} className={`btn sm ${lotFilter === k ? (k === 'rejected' ? 'err' : k === 'inspect' ? 'warn' : 'pri') : 'ghost'}`}
                onClick={() => setLotFilter(k)}
                title={k === 'inspect' ? '입고 대기·검수 중 로트만 — 대시보드 검수 대기 큐와 같은 집합' : k === 'rejected' ? '검수 반려 로트만 — 재검수·반품 확인 대상' : '전체 입고 로트'}>
                {lotFilter === k ? '✓ ' : ''}{k === 'inspect' ? '검수 대기' : k === 'rejected' ? '검수 반려' : '전체'} {n}
              </button>
            ))}
            <span className="mut" data-queue="lot=inspect lot=rejected" style={{ fontSize: 12 }}>{shownLots.length} / {arrivedLots.length}건</span>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>입고번호</th><th>계약</th><th>모델</th><th>공급사</th><th className="num">수량</th><th className="num">채번</th><th>입고일</th><th className="c">상태</th><th className="c">선택</th></tr>
            </thead>
            <tbody>
              {shownLots.map((l) => (
                <tr key={l.id} className={`clickable ${l.id === sel?.id ? 'sel' : ''}`} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(l.id) } }}
                  onClick={() => setSelId(l.id)}>
                  <td className="code">{l.id}</td>
                  <td className="code">{l.contractId}</td>
                  <td className="strong">{l.model}</td>
                  <td className="mute">{l.vendor}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num tnum">{l.issued.length}</td>
                  <td className="tnum">{l.arrivedAt}</td>
                  <td className="c"><Chip tone={STATUS_TONE[l.status]}>{l.status}</Chip></td>
                  <td className="c">{l.id === sel?.id ? <Chip tone="info" bare>선택됨</Chip> : <span className="mut">클릭</span>}</td>
                </tr>
              ))}
              {shownLots.length === 0 && <tr><td colSpan={9}><div className="empty">{arrivedLots.length === 0 ? '입고된 로트가 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {sel && (
        <div className="cols c2">
          <Card kicker="Inspection" title={`검수 체크리스트 — ${sel.model}`}
            actions={<Chip tone={done === sel.checklist.length ? 'ok' : 'warn'}>{done}/{sel.checklist.length} 완료</Chip>}>
            <div className="vstack" style={{ gap: 7 }}>
              {checkLock && <div className="mut" style={{ fontSize: 11.5 }}>{checkLock}</div>}
              {sel.checklist.map((c) => (
                <button key={c.item} disabled={pending || !!checkLock} title={checkLock ?? undefined}
                  onClick={() => startTransition(async () => { const r = await toggleCheck(sel.id, c.item); setMsg({ ok: r.ok, text: r.message }) })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5,
                    background: c.checked ? 'var(--ok-bg)' : '#fff',
                    color: c.checked ? 'var(--ok)' : 'var(--ink-2)',
                  }}>
                  <span style={{
                    width: 18, height: 18, flex: 'none', borderRadius: 5, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${c.checked ? 'var(--ok)' : 'var(--line-strong)'}`,
                    background: c.checked ? 'var(--ok)' : '#fff', color: '#fff',
                  }}>{c.checked ? '✓' : ''}</span>
                  <span style={{ fontWeight: c.checked ? 600 : 500 }}>{c.item}</span>
                </button>
              ))}
            </div>
            {sel.unitCost ? (
              <div className="dim" style={{ marginTop: 12, fontSize: 12 }}>발주 단가 <b>{sel.unitCost.toLocaleString()}원</b> — 채번 시 각 자산의 취득가로 반영됩니다.</div>
            ) : null}
            <div className="hstack" style={{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn pri" disabled={pending || sel.status !== '검수 완료' || sel.issued.length >= sel.qty}
                onClick={() => startTransition(async () => {
                  const r = await issueAssetNo(sel.id)
                  setMsg({ ok: r.ok, text: r.message })
                })}>
                자산번호 채번 · 대장 등록
              </button>
              {/* 검수 완료 로트도 채번 전이면 반려할 수 있다(서버 rejectIntakeLot 과 같은 조건) — 검수를 마친 뒤 결함을
                  발견했을 때 되돌릴 길이 있어야 한다. 체크리스트는 검수 완료에서 잠기고 재검수는 반려분만 받으므로,
                  여기서 막으면 앞으로(채번) 말고는 갈 곳이 없다. 채번이 시작된 로트는 그대로 막는다. */}
              {['입고 대기', '검수 중', '검수 완료'].includes(sel.status) && sel.issued.length === 0 && (
                rejecting ? (
                  <span className="hstack" style={{ gap: 6 }}>
                    <input className="input" style={{ width: 180, height: 28 }} autoFocus
                      placeholder="반려 사유 (불량 내용)" value={rjReason} onChange={(e) => setRjReason(e.target.value)} />
                    <button className="btn sm danger" disabled={pending || !rjReason.trim()}
                      onClick={() => startTransition(async () => {
                        const r = await rejectIntakeLot(sel.id, rjReason)
                        setMsg({ ok: r.ok, text: r.message })
                        if (r.ok) { setRejecting(false); setRjReason('') }
                      })}>반려 확정</button>
                    <button className="btn sm ghost" disabled={pending} onClick={() => { setRejecting(false); setRjReason('') }}>취소</button>
                  </span>
                ) : (
                  <button className="btn sm danger" disabled={pending} onClick={() => setRejecting(true)}>검수 반려</button>
                )
              )}
              {sel.status === '검수 반려' && (
                <>
                  <button className="btn sm pri" disabled={pending}
                    onClick={() => startTransition(async () => {
                      const r = await reinspectIntakeLot(sel.id)
                      setMsg({ ok: r.ok, text: r.message })
                    })}>재검수 (교체품 도착)</button>
                  <button className="btn sm ghost" disabled={pending}
                    title="교체품 없이 반품·환불로 종결 — 검수 반려 백로그에서 제외"
                    onClick={() => startTransition(async () => {
                      const r = await closeReturnedLot(sel.id)
                      setMsg({ ok: r.ok, text: r.message })
                    })}>반품 완료 (교체 없음)</button>
                </>
              )}
              <span className="dim" style={{ fontSize: 11.5 }}>
                {sel.status === '검수 완료' ? `채번 ${sel.issued.length}/${sel.qty}`
                  : sel.status === '검수 반려' ? '반려됨 — 교체품 도착 시 재검수, 교체 없으면 반품 완료'
                  : sel.status === '반품 완료' ? '반품 완료 — 교체 없이 종결됨'
                  : '체크리스트 완료 후 채번 · 불량 시 반려'}
              </span>
              {(!!sel.inspector || sel.issued.length > 0) && (
                <div style={{ marginTop: 8 }}>
                  <a className="btn sm" href={`/api/intake-cert/${sel.id}`} target="_blank" rel="noopener"
                    title="검수 확인서 인쇄 — 물품 인수·검수 증적(대금 지급·감사 대응)">🖨 검수 확인서</a>
                </div>
              )}
            </div>
          </Card>

          <Card kicker="Labels" title="라벨 발행 (바코드 / QR)"
            actions={selLabels.length > 0 ? <button className="btn sm" onClick={() => window.print()}>인쇄</button> : undefined}>
            {selLabels.length === 0 ? (
              <div className="empty">채번된 자산이 없습니다 — 검수 완료 후 채번하면 라벨이 발행됩니다</div>
            ) : (
              <div className="vstack" style={{ gap: 10 }}>
                {selLabels.map((l) => (
                  <div key={l.assetNo} className="asset-label">
                    <div className="qr" dangerouslySetInnerHTML={{ __html: l.qr }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="kicker mute">SEEKERSLAB · IT ASSET</div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-deep)', margin: '2px 0 1px' }}>{l.assetNo}</div>
                      <div className="dim" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.model}</div>
                      <div className="bc" dangerouslySetInnerHTML={{ __html: l.barcode }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
