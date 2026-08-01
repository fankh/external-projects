'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { ReturnCondition } from '@/lib/types'
import { completeRepair, receiveReturn } from './actions'

const CONDITIONS: ReturnCondition[] = ['정상', '수리 필요', '폐기 권고']

type Pending = { assetNo: string; model: string; owner: string; dept: string; location: string; since: string }
type Idle = { assetNo: string; model: string; category: string; location: string; idleDays: number | null }
type Repairing = { assetNo: string; model: string; category: string; location: string; note: string }

export function ReturnsView(props: {
  pending: Pending[]
  idle: Idle[]
  repairing: Repairing[]
  locations: string[]
  /** 배정 대기 중인 자산 신청 수 — 재배치 우선 원칙의 근거 */
  openRequests: number
}) {
  const [cond, setCond] = useState<Record<string, ReturnCondition>>({})
  const [loc, setLoc] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [rnote, setRnote] = useState<Record<string, string>>({})
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
        <Card kicker="Maintenance" title={`수리 대기 ${props.repairing.length}건`} pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>자산번호</th><th>모델</th><th className="c">유형</th><th>보관 위치</th><th>점검 메모</th><th>수리 메모</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {props.repairing.map((a) => (
                  <tr key={a.assetNo}>
                    <td className="tnum">{a.assetNo}</td>
                    <td>{a.model}</td>
                    <td className="c dim">{a.category}</td>
                    <td className="dim">{a.location}</td>
                    <td className="dim" style={{ fontSize: 11, maxWidth: 260, whiteSpace: 'normal' }}>{a.note}</td>
                    <td>
                      <input className="input" style={{ minWidth: 140 }} placeholder="예: 메인보드 교체"
                        value={rnote[a.assetNo] ?? ''} onChange={(e) => setRnote((m) => ({ ...m, [a.assetNo]: e.target.value }))} />
                    </td>
                    <td className="c">
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 완료', rnote[a.assetNo] ?? '')).message))}>수리 완료</button>
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await completeRepair(a.assetNo, '수리 불가', rnote[a.assetNo] ?? '')).message))}>수리 불가</button>
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
                <tr><th>자산번호</th><th>모델</th><th className="c">유형</th><th>보관 위치</th><th className="num">유휴 경과</th></tr>
              </thead>
              <tbody>
                {props.idle.map((a) => (
                  <tr key={a.assetNo}>
                    <td className="tnum">{a.assetNo}</td>
                    <td>{a.model}</td>
                    <td className="c dim">{a.category}</td>
                    <td className="dim">{a.location}</td>
                    <td className="num">
                      {a.idleDays === null
                        ? <span className="dim">-</span>
                        : <Chip tone={a.idleDays >= 90 ? 'warn' : 'neutral'}>{a.idleDays}일</Chip>}
                    </td>
                  </tr>
                ))}
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
        </div>
      </div>
    </>
  )
}
