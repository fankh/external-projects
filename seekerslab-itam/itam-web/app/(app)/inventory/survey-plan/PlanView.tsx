'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { InventoryRound, RoundKind } from '@/lib/types'
import { cancelRound, composeUnconfirmedRound, planRound, startRound } from './actions'

const STATUS_TONE: Record<InventoryRound['status'], 'ok' | 'info' | 'neutral'> = {
  완료: 'ok', 진행중: 'info', 계획: 'neutral',
}

export function PlanView(props: {
  rounds: InventoryRound[]
  /** 대상 범위 후보 — 공통코드 LOCATION 그룹 (환경설정 › 공통코드가 원천) */
  scopes: string[]
  /** 조사 담당자 후보 — 자산담당 권한 계정 */
  assignees: string[]
  /** 대사 결과 '미확인' 전체 건수 */
  unconfirmed: number
  /** 그중 아직 어떤 조사 회차에도 편성되지 않은 건수 — 자동 편성의 실제 대상 */
  pendingCompose: number
  today: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RoundKind>('연간')
  const [scope, setScope] = useState('전사')
  const [assignee, setAssignee] = useState(props.assignees[0] ?? '')
  const [dueDate, setDueDate] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    startTransition(async () => {
      const r = await planRound({ name, kind, scope, assignee, dueDate })
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) { setName(''); setDueDate(''); setOpen(false) }
    })
  }

  return (
    <>
      <Card
        kicker="Inventory Planning"
        title="조사 회차"
        pad={false}
        actions={
          <button className="btn sm pri" onClick={() => setOpen((o) => !o)} disabled={pending}>
            {open ? '취소' : '계획 수립'}
          </button>
        }
      >
        {open && (
          <div className="vstack" style={{ gap: 8, padding: 14, borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
            <div className="hstack" style={{ gap: 8 }}>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as RoundKind)}>
                <option value="연간">연간 정기</option>
                <option value="수시">수시</option>
              </select>
              <input className="input" style={{ flex: 1 }} placeholder="회차명 — 예: 2027 상반기 정기 재물조사"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="hstack" style={{ gap: 8 }}>
              <select className="select" style={{ flex: 1 }} value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="전사">대상 범위 — 전사</option>
                {props.scopes.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
              </select>
              <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {props.assignees.map((a) => <option key={a} value={a}>담당 — {a}</option>)}
              </select>
              <input className="input" type="date" value={dueDate} min={props.today}
                onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="hstack">
              <span className="dim" style={{ fontSize: 11.5 }}>
                대상 모수는 선택한 범위의 대장 자산에서 자동 산출됩니다 (폐기 완료 제외).
              </span>
              <span className="right" />
              <button className="btn pri" disabled={pending || !name.trim() || !dueDate} onClick={submit}>등록</button>
            </div>
          </div>
        )}
        {msg && <div className="callout" style={{ margin: 14 }}>{msg.text}</div>}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>회차</th><th className="c">유형</th><th>대상 범위</th><th>담당자</th>
                <th className="c">기한</th><th className="num">대상</th><th>진행</th><th className="c">상태</th><th />
              </tr>
            </thead>
            <tbody>
              {props.rounds.map((r) => {
                const pct = r.planned ? Math.round((r.scanned / r.planned) * 100) : 0
                const overdue = r.status !== '완료' && r.dueDate < props.today
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{r.id}</div>
                    </td>
                    <td className="c"><Chip tone={r.kind === '연간' ? 'info' : 'neutral'}>{r.kind}</Chip></td>
                    <td className="dim">{r.scope}</td>
                    <td>{r.assignee}</td>
                    <td className="c tnum">
                      {r.dueDate}
                      {overdue && <div><Chip tone="err">기한 경과</Chip></div>}
                    </td>
                    <td className="num tnum">{r.planned.toLocaleString()}</td>
                    <td style={{ minWidth: 130 }}>
                      <div className="meter">
                        <div className="bar"><i className={overdue ? 'low' : ''} style={{ width: `${pct}%` }} /></div>
                        <div className="lbl">
                          <span>{pct}%</span>
                          <span>{r.scanned.toLocaleString()} / {r.planned.toLocaleString()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="c"><Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip></td>
                    <td className="c">
                      {r.status === '계획' && (
                        <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                          <button className="btn sm" disabled={pending}
                            onClick={() => startTransition(() => startRound(r.id))}>조사 개시</button>
                          <button className="btn sm ghost" disabled={pending}
                            onClick={() => startTransition(async () => {
                              const res = await cancelRound(r.id)
                              setMsg({ ok: res.ok, text: res.message })
                            })}>계획 취소</button>
                        </span>
                      )}
                      {r.status === '진행중' && (
                        <Link className="btn sm" href={`/inventory/survey?round=${r.id}`}>실사 화면</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Reconciliation Follow-up" title="미확인(유령) 자산 자동 편성">
        <div className="hstack" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p className="dim" style={{ margin: 0, lineHeight: 1.7 }}>
              CMDB 대사에서 <b>미확인</b>으로 판정된 자산(대장에 있으나 일정 기간 실측 없음)은
              유휴·분실 후보입니다. 수시 조사 회차로 묶어 2주 내 실물 확인을 마치도록 편성합니다.
            </p>
            <div className="hstack" style={{ gap: 6, marginTop: 8 }}>
              <Chip tone={props.unconfirmed ? 'warn' : 'ok'}>미확인 {props.unconfirmed}건</Chip>
              <Chip tone={props.pendingCompose ? 'warn' : 'ok'}>
                {props.pendingCompose ? `편성 대기 ${props.pendingCompose}건` : '편성 완료'}
              </Chip>
              <Link className="btn sm ghost" href="/discovery/reconcile">대사 결과 보기</Link>
            </div>
          </div>
          <button className="btn pri" disabled={pending || props.pendingCompose === 0}
            onClick={() => startTransition(async () => {
              const r = await composeUnconfirmedRound()
              setMsg({ ok: r.ok, text: r.message })
            })}>자동 편성</button>
        </div>
      </Card>
    </>
  )
}
