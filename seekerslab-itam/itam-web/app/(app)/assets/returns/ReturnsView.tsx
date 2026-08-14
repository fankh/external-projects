'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { selectForDisposal } from '@/app/(app)/assets/disposal/actions'
import { extendLoan, returnLoan } from '@/app/(app)/assets/register/actions'
import { Card, Chip } from '@/components/ui'
import type { ReturnCondition } from '@/lib/types'
import { completeRepair, receiveReturn, remindLoans, remindRepairs, sendToRepair } from './actions'

/** 장기 유휴 판정선(일) — 이 이상 유휴면 '재배치 대신 폐기 검토' 대상으로 조치 버튼을 노출한다.
 *  유휴일 칩 경고선(90)과 같은 표시 기준. 에스컬레이션·SLA 같은 운영 정책값과 달리 화면 표시 임계다. */
const LONG_IDLE_DAYS = 90

const CONDITIONS: ReturnCondition[] = ['정상', '수리 필요', '폐기 권고']

type Pending = { assetNo: string; model: string; owner: string; dept: string; location: string; since: string }
type Idle = { assetNo: string; model: string; category: string; location: string; idleDays: number | null }
type Repairing = { assetNo: string; model: string; category: string; location: string; note: string; warranty?: boolean; faultNote?: string; repair?: { vendor: string; sentAt: string; eta?: string; estCost?: number } }
type Loan = { assetNo: string; model: string; owner: string; dept: string; dueDate: string; dday: number | null; overdue: boolean }

export function ReturnsView(props: {
  pending: Pending[]
  idle: Idle[]
  repairing: Repairing[]
  loans: Loan[]
  /** 독촉 대상(연체 + 반환 임박 D-7) 건수 — 대여자 반환 요청 발송 대상 */
  remindable: number
  /** 수리 예상 반환 경과(지연) 건수 — 수리 업체 독촉 발송 대상 */
  repairRemindable: number
  /** 대여 대장 엑셀 반출 권한(권한 매트릭스의 '엑셀' 기능) */
  canExportLoans: boolean
  /** 기준일 YYYY-MM-DD — 연장 date input 의 최소값(과거·현재 기한 이전으로는 연장 불가) */
  today: string
  locations: string[]
  /** 배정 대기 중인 자산 신청 수 — 재배치 우선 원칙의 근거 */
  openRequests: number
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
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const warehouse = props.locations.find((l) => l.includes('자산창고')) ?? props.locations[0] ?? ''

  return (
    <>
      {msg && <div className="callout">{msg}</div>}

      <Card kicker="Phase 4 · Receive" title="반납 접수 대기 — 결재 승인 후 회수 대상" pad={false}>
        {props.pending.length === 0 ? (
          <div className="empty">반납 접수할 자산이 없습니다. 반납 결재가 승인되면 여기에 표시됩니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산</th><th>반납자</th><th>현재 위치</th><th className="c">상태 점검</th><th>보관 위치</th><th>점검 메모</th><th /></tr>
              </thead>
              <tbody>
                {props.pending.map((p) => {
                  const c = cond[p.assetNo] ?? '정상'
                  const scrap = c === '폐기 권고'
                  return (
                    <tr key={p.assetNo}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.model}</div>
                        <div className="dim" style={{ fontSize: 11 }}>{p.assetNo} · 승인 {p.since}</div>
                      </td>
                      <td>{p.owner}<div className="dim" style={{ fontSize: 11 }}>{p.dept}</div></td>
                      <td className="dim">{p.location}</td>
                      <td className="c">
                        <select className="select" value={c}
                          onChange={(e) => setCond((m) => ({ ...m, [p.assetNo]: e.target.value as ReturnCondition }))}>
                          {CONDITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="select" disabled={scrap}
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
        )}
      </Card>

      {props.repairing.length > 0 && (
        <Card kicker="Maintenance" title={`수리 대기 ${props.repairing.length}건`} pad={false}
          actions={props.repairRemindable > 0
            ? <button className="btn sm" disabled={pending}
                title="예상 반환일이 지난 수리 자산의 업체에 진행·반환 일정 회신을 독촉합니다 (발송 이력·감사)"
                onClick={() => startTransition(async () => setMsg((await remindRepairs()).message))}>업체 독촉 발송 {props.repairRemindable}건</button>
            : undefined}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산번호</th><th>모델</th><th>수리 의뢰 (업체·예상반환·견적)</th><th>수리 메모</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {props.repairing.map((a) => (
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
                            의뢰 {a.repair.sentAt}{a.repair.eta ? ` · 예상반환 ${a.repair.eta}` : ''}{a.repair.estCost ? ` · 견적 ${a.repair.estCost.toLocaleString()}원` : ''}
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
                        <input className="input" type="number" min={0} style={{ width: 90 }} placeholder="실 수리비" title="실 수리비(수리 완료 시)"
                          value={rcost[a.assetNo] ?? ''} onChange={(e) => setRcost((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 완료', rnote[a.assetNo] ?? '', Number(rcost[a.assetNo] ?? 0))).message))}>수리 완료</button>
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 불가', rnote[a.assetNo] ?? '', Number(rcost[a.assetNo] ?? 0))).message))}>수리 불가</button>
                      </span>
                    </td>
                  </tr>
                ))}
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
        {props.loans.length === 0 ? (
          <div className="empty">대여 중인 자산이 없습니다. 자산 대장·대여 신청 결재에서 유휴 자산을 반환 기한과 함께 대여하면 여기에 표시됩니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산</th><th>대여자</th><th className="c">반환 기한</th><th className="c">D-day</th><th>기한 연장</th><th className="c">반환</th></tr>
              </thead>
              <tbody>
                {props.loans.map((l) => {
                  const dd = l.dday
                  const tone = l.overdue ? 'err' : dd !== null && dd <= 7 ? 'warn' : 'neutral'
                  const label = dd === null ? '기한 없음' : l.overdue ? `연체 ${-dd}일` : dd === 0 ? '오늘 만기' : `D-${dd}`
                  return (
                    <tr key={l.assetNo}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.model}</div>
                        <div className="dim" style={{ fontSize: 11 }}>{l.assetNo}</div>
                      </td>
                      <td>{l.owner}<div className="dim" style={{ fontSize: 11 }}>{l.dept}</div></td>
                      <td className="c tnum">{l.dueDate}</td>
                      <td className="c"><Chip tone={tone}>{label}</Chip></td>
                      <td>
                        <span className="hstack" style={{ gap: 4 }}>
                          <input className="input" type="date" min={props.today} style={{ width: 150 }}
                            value={ext[l.assetNo] ?? ''} onChange={(e) => setExt((m) => ({ ...m, [l.assetNo]: e.target.value }))} />
                          <button className="btn sm" disabled={pending || !ext[l.assetNo]}
                            onClick={() => startTransition(async () => setMsg((await extendLoan(l.assetNo, ext[l.assetNo] ?? '')).message))}>연장</button>
                        </span>
                      </td>
                      <td className="c">
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await returnLoan(l.assetNo)).message))}>반환 접수</button>
                      </td>
                    </tr>
                  )
                })}
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
