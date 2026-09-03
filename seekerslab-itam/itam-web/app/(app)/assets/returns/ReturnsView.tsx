'use client'
import { NUM_LOCALE } from '@/lib/dates'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { selectForDisposal } from '@/app/(app)/assets/disposal/actions'
import { extendLoan, returnLoan } from '@/app/(app)/assets/register/actions'
import { Card, Chip } from '@/components/ui'
import { LONG_IDLE_DAYS } from '@/lib/types'
import type { ReturnCondition } from '@/lib/types'
import { completeRepair, receiveReturn, receiveReturnMany, remindLoans, remindRepairs, sendToRepair } from './actions'

/** 장기 유휴 판정선은 lib/types 의 LONG_IDLE_DAYS 한 곳에서 읽는다 — 반납 화면의 KPI 건수·라벨과 같은 수여야 한다.
 *  (이 파일이 90 을 따로 들고 있으면 기준을 바꿀 때 행 배지만 옛 선으로 남는다.) */

const CONDITIONS: ReturnCondition[] = ['정상', '수리 필요', '폐기 권고']

type Pending = { assetNo: string; model: string; owner: string; dept: string; location: string; since: string }
type Idle = { assetNo: string; model: string; category: string; location: string; idleDays: number | null }
type Repairing = { assetNo: string; model: string; category: string; location: string; note: string; warranty?: boolean; faultNote?: string; repair?: { vendor: string; sentAt: string; eta?: string; estCost?: number }; /** 예상 반환 경과(미회신 포함) — 대시보드 업체 독촉 큐와 같은 lib/dates 판정을 서버가 계산해 넘긴다 */ repairOverdue?: boolean }
type Loan = { assetNo: string; model: string; owner: string; dept: string; dueDate: string; dday: number | null; overdue: boolean; returnRequested?: boolean }

export function ReturnsView(props: {
  pending: Pending[]
  idle: Idle[]
  repairing: Repairing[]
  loans: Loan[]
  /** 독촉 대상(연체 + 반환 임박 D-7) 건수 — 대여자 반환 요청 발송 대상 */
  remindable: number
  /** 수리 예상 반환 경과(지연) 건수 — 수리 업체 독촉 발송 대상 */
  repairRemindable: number
  /** 수리중인데 의뢰 정보(업체·의뢰일)가 없는 건 — 업체가 없어 독촉 대상이 아니다(등록이 먼저다) */
  repairUnrecorded?: number
  /** 대여 대장 엑셀 반출 권한(권한 매트릭스의 '엑셀' 기능) */
  canExportLoans: boolean
  /** 기준일 YYYY-MM-DD — 연장 date input 의 최소값(과거·현재 기한 이전으로는 연장 불가) */
  today: string
  locations: string[]
  /** 배정 대기 중인 자산 신청 수 — 재배치 우선 원칙의 근거 */
  openRequests: number
  /** 대시보드 대여 큐의 드릴다운 — '연체'·'임박' 필터를 켠 채 연다 */
  initialLoan?: '전체' | '연체' | '임박'
  /** 대시보드 수리 업체 독촉 큐의 드릴다운 — 예상 반환 경과만 보기로 연다 */
  initialRepairOverdue?: boolean
}) {
  const [cond, setCond] = useState<Record<string, ReturnCondition>>({})
  const [loc, setLoc] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [rnote, setRnote] = useState<Record<string, string>>({})
  const [rcost, setRcost] = useState<Record<string, string>>({}) // 실 수리비(수리 완료 시)
  const [rvendor, setRvendor] = useState<Record<string, string>>({})
  const [reta, setReta] = useState<Record<string, string>>({})
  const [rest, setRest] = useState<Record<string, string>>({}) // 견적
  const [ext, setExt] = useState<Record<string, string>>({})
  const [lcond, setLcond] = useState<Record<string, ReturnCondition>>({}) // 대여 반환 상태 점검
  const [msg, setMsg] = useState<string | null>(null)
  // 대시보드 큐(대여 연체·반환 임박·수리 예상 반환 경과)의 드릴다운 — 표는 정상 건까지 함께 보여 주므로
  //  큐가 말한 건수를 화면에서 다시 세어야 했다. 판정은 큐·독촉과 같은 lib/dates(overdue·dday)에서 온다.
  const [loanFilter, setLoanFilter] = useState<'전체' | '연체' | '임박'>(props.initialLoan ?? '전체')
  const [repairOverdueOnly, setRepairOverdueOnly] = useState(Boolean(props.initialRepairOverdue))
  const loanOverdueCount = props.loans.filter((l) => l.overdue).length
  const loanSoonCount = props.loans.filter((l) => !l.overdue && l.dday !== null && l.dday <= 7).length
  const shownLoans = loanFilter === '연체' ? props.loans.filter((l) => l.overdue)
    : loanFilter === '임박' ? props.loans.filter((l) => !l.overdue && l.dday !== null && l.dday <= 7)
    : props.loans
  const repairOverdueCount = props.repairing.filter((a) => a.repairOverdue).length
  const shownRepairing = repairOverdueOnly ? props.repairing.filter((a) => a.repairOverdue) : props.repairing
  // 반납 일괄 접수 — 팀 오프보딩·사무실 이전으로 반납대기에 몰린 묶음을 같은 점검 결과·위치로 한 번에 접수(일괄 회수의 짝)
  const [retSel, setRetSel] = useState<Set<string>>(new Set())
  const [bulkCond, setBulkCond] = useState<ReturnCondition>('정상')
  const [bulkLoc, setBulkLoc] = useState('')
  const [pending, startTransition] = useTransition()

  const warehouse = props.locations.find((l) => l.includes('자산창고')) ?? props.locations[0] ?? ''
  const toggleRet = (no: string) => setRetSel((prev) => { const n = new Set(prev); n.has(no) ? n.delete(no) : n.add(no); return n })
  const allRet = props.pending.length > 0 && props.pending.every((p) => retSel.has(p.assetNo))
  const bulkReceive = () => startTransition(async () => {
    const r = await receiveReturnMany([...retSel], bulkCond, bulkLoc || warehouse, '')
    setMsg(r.message); if (r.ok) setRetSel(new Set())
  })

  return (
    <>
      {msg && <div className="callout">{msg}</div>}

      {/* 형제 두 카드(수리 대기 N건 · 대여 현황 N건)는 건수를 적는데 이 카드만 안 적었다 — 대시보드
          '반납 접수 대기' 큐가 세는 집합이 바로 이 표라, 큐가 말한 수를 화면에서 맞대 볼 자리가 없었다. */}
      <Card id="receive" kicker="Phase 4 · Receive" title={<>반납 접수 대기 <span data-queue="#receive">{props.pending.length}</span>건 — 결재 승인 후 회수 대상</>} pad={false}>
        {props.pending.length === 0 ? (
          <div className="empty">반납 접수할 자산이 없습니다. 반납 결재가 승인되면 여기에 표시됩니다.</div>
        ) : (
          <>
          {retSel.size > 0 && (
            <div className="hstack" style={{ gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--canvas)' }}>
              <span className="mut" style={{ fontSize: 12.5 }}>선택 {retSel.size}건 일괄 접수:</span>
              <select className="select" style={{ height: 28 }} value={bulkCond} disabled={pending} onChange={(e) => setBulkCond(e.target.value as ReturnCondition)} title="일괄 상태 점검 결과">
                {CONDITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              {bulkCond !== '폐기 권고' && (
                <select className="select" style={{ height: 28 }} value={bulkLoc || warehouse} disabled={pending} onChange={(e) => setBulkLoc(e.target.value)} title="일괄 보관 위치">
                  {props.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              )}
              <button className="btn sm pri" disabled={pending} onClick={bulkReceive}>일괄 접수 ({retSel.size})</button>
              <button className="btn sm ghost" disabled={pending} onClick={() => setRetSel(new Set())}>선택 해제</button>
            </div>
          )}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th className="c" style={{ width: 32 }}><input type="checkbox" checked={allRet} aria-label="반납대기 전체 선택" disabled={pending} onChange={(e) => setRetSel(e.target.checked ? new Set(props.pending.map((p) => p.assetNo)) : new Set())} /></th><th>자산</th><th>반납자</th><th>현재 위치</th><th className="c">상태 점검</th><th>보관 위치</th><th>점검 메모</th><th /></tr>
              </thead>
              <tbody>
                {props.pending.map((p) => {
                  const c = cond[p.assetNo] ?? '정상'
                  const scrap = c === '폐기 권고'
                  return (
                    <tr key={p.assetNo}>
                      <td className="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={retSel.has(p.assetNo)} disabled={pending} aria-label={`${p.assetNo} 일괄 접수 선택`} onChange={() => toggleRet(p.assetNo)} /></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.model}</div>
                        <div className="dim" style={{ fontSize: 11 }}>{p.assetNo} · 승인 {p.since}</div>
                      </td>
                      <td>{p.owner}<div className="dim" style={{ fontSize: 11 }}>{p.dept}</div></td>
                      <td className="dim">{p.location}</td>
                      <td className="c">
                        <select aria-label="반납 점검 결과" className="select" value={c}
                          onChange={(e) => setCond((m) => ({ ...m, [p.assetNo]: e.target.value as ReturnCondition }))}>
                          {CONDITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td>
                        <select aria-label="반납 보관 위치" className="select" disabled={scrap}
                          value={scrap ? '' : (loc[p.assetNo] ?? warehouse)}
                          onChange={(e) => setLoc((m) => ({ ...m, [p.assetNo]: e.target.value }))}>
                          {scrap
                            ? <option>폐기 절차로 전환</option>
                            : props.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="input" style={{ minWidth: 150 }} placeholder="예: 키보드 각인 마모"
                          value={note[p.assetNo] ?? ''}
                          onChange={(e) => setNote((m) => ({ ...m, [p.assetNo]: e.target.value }))} />
                      </td>
                      <td className="c">
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => {
                            const r = await receiveReturn(p.assetNo, c, loc[p.assetNo] ?? warehouse, note[p.assetNo] ?? '')
                            setMsg(r.message)
                          })}>접수</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {props.repairing.length > 0 && (
        <Card id="repair" kicker="Maintenance" title={<>수리 대기 <span data-queue="#repair">{props.repairing.length}</span>건{(props.repairUnrecorded ?? 0) > 0 && <span className="mut" style={{ fontSize: 12, fontWeight: 400 }}> · 의뢰 정보 미기재 {props.repairUnrecorded}건(업체·일정 등록 필요 — 독촉 불가)</span>}</>} pad={false}
          actions={props.repairRemindable > 0
            ? <button className="btn sm" disabled={pending}
                title="예상 반환일이 지났거나 아직 반환 일정을 받지 못한 수리 자산의 업체에 진행·반환 일정 회신을 독촉합니다 (발송 이력·감사)"
                onClick={() => startTransition(async () => setMsg((await remindRepairs()).message))}>업체 독촉 발송 {props.repairRemindable}건</button>
            : undefined}>
          {repairOverdueCount > 0 && (
            <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
              <button className={`btn sm ${repairOverdueOnly ? 'err' : 'ghost'}`} onClick={() => setRepairOverdueOnly((r) => !r)}
                title="예상 반환일이 지난 수리만 — 대시보드 업체 독촉 큐와 같은 집합">
                {repairOverdueOnly ? '✓ ' : ''}예상 반환 경과만 {repairOverdueCount}
              </button>
              <span className="mut" data-queue="repair=overdue" style={{ fontSize: 12 }}>{shownRepairing.length} / {props.repairing.length}건</span>
            </div>
          )}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산번호</th><th>모델</th><th>수리 의뢰 (업체·예상반환·견적)</th><th>수리 메모</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {shownRepairing.map((a) => (
                  <tr key={a.assetNo}>
                    <td className="tnum">{a.assetNo}<div className="dim" style={{ fontSize: 11 }}>{a.category} · {a.location}</div>
                      {a.warranty && <Chip tone="ok" bare>보증 수리 (무상)</Chip>}</td>
                    <td>{a.model}
                      {a.faultNote && <div style={{ fontSize: 11.5, maxWidth: 240, whiteSpace: 'normal', marginTop: 2 }}><span className="strong">수리 사유</span> <span className="dim">— {a.faultNote}</span></div>}
                      <div className="dim" style={{ fontSize: 11, maxWidth: 220, whiteSpace: 'normal' }}>{a.note}</div></td>
                    <td>
                      {a.repair ? (
                        <span className="vstack" style={{ gap: 2, fontSize: 12 }}>
                          <span className="hstack" style={{ gap: 6 }}>
                            <span className="strong">{a.repair.vendor}</span>
                            {a.repair.eta && props.today && a.repair.eta < props.today && <Chip tone="err">반환 지연</Chip>}
                          </span>
                          <span className="dim" style={{ fontSize: 11 }}>
                            의뢰 {a.repair.sentAt}{a.repair.eta ? ` · 예상반환 ${a.repair.eta}` : ''}{a.repair.estCost ? ` · 견적 ${a.repair.estCost.toLocaleString(NUM_LOCALE)}원` : ''}
                          </span>
                          {a.warranty && a.repair.estCost ? <span className="hstack"><Chip tone="warn" bare>보증 내 · 견적 대신 무상 보증 청구 권장</Chip></span> : null}
                        </span>
                      ) : (
                        <span className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                          <input className="input" style={{ width: 120 }} placeholder="수리 업체" value={rvendor[a.assetNo] ?? ''} onChange={(e) => setRvendor((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                          <input className="input" type="date" style={{ width: 130 }} title="예상 반환일" value={reta[a.assetNo] ?? ''} onChange={(e) => setReta((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                          <input className="input" type="number" min={0} style={{ width: 90 }} placeholder="견적" value={rest[a.assetNo] ?? ''} onChange={(e) => setRest((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                          <button className="btn sm" disabled={pending || !(rvendor[a.assetNo] ?? '').trim()}
                            onClick={() => startTransition(async () => setMsg((await sendToRepair(a.assetNo, rvendor[a.assetNo] ?? '', reta[a.assetNo] ?? '', Number(rest[a.assetNo] ?? 0))).message))}>의뢰</button>
                        </span>
                      )}
                    </td>
                    <td>
                      <input className="input" style={{ minWidth: 120 }} placeholder="예: 메인보드 교체"
                        value={rnote[a.assetNo] ?? ''} onChange={(e) => setRnote((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                    </td>
                    <td className="c">
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <input className="input" type="number" min={0} style={{ width: 90 }} placeholder="실 수리비" title="실 수리비(수리 완료 시). 무상 보증 청구는 제조사 부담(절감)액."
                          value={rcost[a.assetNo] ?? ''} onChange={(e) => setRcost((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 완료', rnote[a.assetNo] ?? '', Number(rcost[a.assetNo] ?? 0))).message))}>수리 완료</button>
                        {a.warranty && <button className="btn sm" disabled={pending}
                          title="보증 기간 내 자산 — 제조사 보증으로 무상 청구(자사 부담 0). 실 수리비 칸의 금액을 제조사 부담(절감)액으로 기록해 '보증 절감'으로 집계합니다."
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 완료', rnote[a.assetNo] ?? '', Number(rcost[a.assetNo] ?? 0), true)).message))}>무상 보증 청구</button>}
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 불가', rnote[a.assetNo] ?? '', Number(rcost[a.assetNo] ?? 0))).message))}>수리 불가</button>
                      </span>
                    </td>
                  </tr>
                ))}
                {shownRepairing.length === 0 && <tr><td colSpan={5}><div className="empty">{props.repairing.length === 0 ? '수리 중인 자산이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            <b>고장 자산은 수리를 마쳐야 재배치됩니다.</b> 수리 완료는 유휴 풀로, 수리 불가는 폐기예정으로 전환됩니다.
            수리중 자산은 유휴 풀·불출 대상에서 제외되어 고장난 채 재불출되지 않습니다.
          </div>
        </Card>
      )}

      <Card
        kicker="On Loan"
        title={`대여 현황 ${props.loans.length}건 — 반출·반환 기한 관리`}
        pad={false}
        actions={
          (props.loans.length > 0 && props.canExportLoans) || props.remindable > 0
            ? <span className="hstack" style={{ gap: 6 }}>
                {props.loans.length > 0 && props.canExportLoans &&
                  <a className="btn sm" href="/api/export/loans" download>⤓ 대여 대장 엑셀</a>}
                {props.remindable > 0 &&
                  <button className="btn sm pri" disabled={pending}
                    onClick={() => startTransition(async () => setMsg((await remindLoans()).message))}>반환 독촉 발송 {props.remindable}건</button>}
              </span>
            : undefined
        }
      >
        {(loanOverdueCount > 0 || loanSoonCount > 0) && (
          <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            {([['전체', props.loans.length], ['연체', loanOverdueCount], ['임박', loanSoonCount]] as const).map(([k, n]) => (
              <button key={k} className={`btn sm ${loanFilter === k ? (k === '연체' ? 'err' : k === '임박' ? 'warn' : 'pri') : 'ghost'}`}
                onClick={() => setLoanFilter(k)} title={k === '연체' ? '반환 기한이 지난 대여만 — 대시보드 연체 큐·반환 독촉과 같은 집합' : k === '임박' ? '반환 기한 D-7 이내(연체 전) 대여만 — 대시보드 사전 안내 큐와 같은 집합' : '전체 대여'}>
                {loanFilter === k ? '✓ ' : ''}{k} {n}
              </button>
            ))}
            <span className="mut" data-queue="loan=연체" style={{ fontSize: 12 }}>{shownLoans.length} / {props.loans.length}건</span>
          </div>
        )}
        {props.loans.length === 0 ? (
          <div className="empty">대여 중인 자산이 없습니다. 자산 대장·대여 신청 결재에서 유휴 자산을 반환 기한과 함께 대여하면 여기에 표시됩니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산</th><th>대여자</th><th className="c">반환 기한</th><th className="c">D-day</th><th>기한 연장</th><th className="c">반환</th></tr>
              </thead>
              <tbody>
                {shownLoans.map((l) => {
                  const dd = l.dday
                  const tone = l.overdue ? 'err' : dd !== null && dd <= 7 ? 'warn' : 'neutral'
                  const label = dd === null ? '기한 없음' : l.overdue ? `연체 ${-dd}일` : dd === 0 ? '오늘 만기' : `D-${dd}`
                  return (
                    <tr key={l.assetNo}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.model} {l.returnRequested && <Chip tone="warn" bare>반납 신청</Chip>}</div>
                        <div className="dim" style={{ fontSize: 11 }}>{l.assetNo}</div>
                      </td>
                      <td>{l.owner}<div className="dim" style={{ fontSize: 11 }}>{l.dept}</div></td>
                      <td className="c tnum">{l.dueDate}</td>
                      <td className="c"><Chip tone={tone}>{label}</Chip></td>
                      <td>
                        <span className="hstack" style={{ gap: 4 }}>
                          <input className="input" type="date" aria-label="수리 예상 반환일" min={props.today} style={{ width: 150 }}
                            value={ext[l.assetNo] ?? ''} onChange={(e) => setExt((m) => ({ ...m, [l.assetNo]: e.target.value }))} />
                          <button className="btn sm" disabled={pending || !ext[l.assetNo]}
                            onClick={() => startTransition(async () => setMsg((await extendLoan(l.assetNo, ext[l.assetNo] ?? '')).message))}>연장</button>
                        </span>
                      </td>
                      <td className="c">
                        <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                          <select aria-label="수리 결과 구분" className="input" style={{ width: 92, height: 26, fontSize: 11 }} value={lcond[l.assetNo] ?? '정상'}
                            disabled={pending} onChange={(e) => setLcond((m) => ({ ...m, [l.assetNo]: e.target.value as ReturnCondition }))}
                            title="반환 실물 상태 점검 — 손상분은 수리중·폐기 절차로(손상 자산 재대여 방지)">
                            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button className="btn sm pri" disabled={pending}
                            onClick={() => startTransition(async () => setMsg((await returnLoan(l.assetNo, lcond[l.assetNo] ?? '정상')).message))}>반환 접수</button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {shownLoans.length === 0 && <tr><td colSpan={6}><div className="empty">{props.loans.length === 0 ? '대여 중인 자산이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {props.loans.length > 0 && (
          <div className="callout" style={{ margin: 14 }}>
            <b>대여는 기한부 반출입니다.</b> 반환 기한이 지나면 <Chip tone="err" bare>연체</Chip> 로 드러나 대시보드 운영 큐에도 노출됩니다.
            반납 없이 <b>기한만 연장</b>할 수 있고, <b>반환 접수</b> 시 유휴 풀로 편성돼 검수실 재확인 후 재배치됩니다.
          </div>
        )}
      </Card>

      <Card
        kicker="Idle Pool"
        title={`유휴 자산 풀 ${props.idle.length}건`}
        pad={false}
        actions={
          props.openRequests > 0
            ? <Link className="btn sm pri" href="/assets/movement">배정 대기 {props.openRequests}건 → 불출 처리</Link>
            : undefined
        }
      >
        {props.idle.length === 0 ? (
          <div className="empty">유휴 자산이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산번호</th><th>모델</th><th className="c">유형</th><th>보관 위치</th><th className="num">유휴 경과</th><th className="c">조치</th></tr>
              </thead>
              <tbody>
                {props.idle.map((a) => {
                  const longIdle = a.idleDays !== null && a.idleDays >= LONG_IDLE_DAYS
                  return (
                  <tr key={a.assetNo}>
                    <td className="tnum">{a.assetNo}</td>
                    <td>{a.model}</td>
                    <td className="c dim">{a.category}</td>
                    <td className="dim">{a.location}</td>
                    <td className="num">
                      {a.idleDays === null
                        ? <span className="dim">-</span>
                        : <Chip tone={longIdle ? 'warn' : 'neutral'}>{a.idleDays}일</Chip>}
                    </td>
                    <td className="c">
                      {longIdle
                        ? <button className="btn sm danger" disabled={pending}
                            title="장기 유휴 자산을 폐기 후보로 선정합니다 — 폐기 결재·데이터 소거 절차로 이어집니다 (재배치가 불가한 경우)"
                            onClick={() => startTransition(async () => setMsg((await selectForDisposal(a.assetNo, `장기 유휴 ${a.idleDays}일 · 재배치 대신 폐기 검토`)).message))}>폐기 검토</button>
                        : <span className="mut" style={{ fontSize: 11 }}>재배치 우선</span>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="cols c2">
        <div className="callout">
          <b>재배치 우선 원칙.</b> 신규 구매보다 유휴 풀 배정을 먼저 검토합니다. 배정 대기 중인 자산 신청이 있으면
          불출 처리 화면에서 이 풀의 자산을 바로 배정할 수 있습니다.
        </div>
        <div className="callout">
          <b>점검 결과가 경로를 가릅니다.</b> 정상은 유휴 풀로, <b>수리 필요는 수리중을 거쳐</b> 수리 완료 후에야
          유휴 풀에 들어갑니다. 폐기 권고는 유휴를 거치지 않고 폐기예정으로 전환되어 폐기 결재·소거 절차로 넘어갑니다.
          <br />
          <b>반납 접수 시 반납자에게 점검 결과가 자동 통보됩니다</b> — 실물 회수·점검 완료와 판정(정상·수리 필요·폐기 권고)이
          발송되어, 반납자가 파손 판정 등 후속 조치를 즉시 알 수 있습니다.
        </div>
      </div>
    </>
  )
}
