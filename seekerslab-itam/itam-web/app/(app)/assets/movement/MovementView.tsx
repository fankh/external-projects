'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { issueAsset, moveAsset } from './actions'

type Issue = { id: string; title: string; requester: string; dept: string; requestedAt: string; note?: string }
type Move = {
  id: string; title: string; requester: string; requestedAt: string
  assetNo?: string; model: string; from: string; to?: string
}
type Pool = { assetNo: string; model: string; category: string; location: string; status: string }

export function MovementView(props: {
  issues: Issue[]
  moves: Move[]
  pool: Pool[]
  locations: string[]
  done: { id: string; kind: string; title: string; requester: string }[]
}) {
  const [sel, setSel] = useState<Record<string, string>>({})
  const [loc, setLoc] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const poolEmpty = props.pool.length === 0

  return (
    <>
      {msg && <div className="callout">{msg}</div>}

      <Card kicker="Phase 3 · Issue" title="불출 대기 — 승인된 자산 신청" pad={false}>
        {props.issues.length === 0 ? (
          <div className="empty">불출 처리할 승인 건이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>결재</th><th>신청자</th><th className="c">승인일</th><th>배정 자산 (유휴 재고)</th><th>불출 위치</th><th /></tr>
              </thead>
              <tbody>
                {props.issues.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{a.id}{a.note ? ` · ${a.note}` : ''}</div>
                    </td>
                    <td>{a.requester}<div className="dim" style={{ fontSize: 11 }}>{a.dept}</div></td>
                    <td className="c tnum">{a.requestedAt}</td>
                    <td>
                      <select className="select" style={{ minWidth: 240 }} disabled={poolEmpty}
                        value={sel[a.id] ?? props.pool[0]?.assetNo ?? ''}
                        onChange={(e) => setSel((m) => ({ ...m, [a.id]: e.target.value }))}>
                        {poolEmpty
                          ? <option>배정 가능한 유휴 재고 없음</option>
                          : props.pool.map((p) => (
                              <option key={p.assetNo} value={p.assetNo}>
                                {p.assetNo} · {p.model} ({p.status})
                              </option>
                            ))}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={loc[a.id] ?? props.locations[0] ?? ''}
                        onChange={(e) => setLoc((m) => ({ ...m, [a.id]: e.target.value }))}>
                        {props.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="c">
                      <button className="btn sm pri" disabled={pending || poolEmpty}
                        onClick={() => startTransition(async () => {
                          const r = await issueAsset(
                            a.id,
                            sel[a.id] ?? props.pool[0].assetNo,
                            loc[a.id] ?? props.locations[0],
                          )
                          setMsg(r.message)
                        })}>불출 처리</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card kicker="Phase 3 · Move" title="이동 대기 — 승인된 이동 신청" pad={false}>
        {props.moves.length === 0 ? (
          <div className="empty">이동 처리할 승인 건이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>결재</th><th>자산</th><th>신청자</th><th>현재 위치</th><th>이동 위치</th><th /></tr>
              </thead>
              <tbody>
                {props.moves.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.title}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{m.id} · 승인 {m.requestedAt}</div>
                    </td>
                    <td>{m.assetNo}<div className="dim" style={{ fontSize: 11 }}>{m.model}</div></td>
                    <td>{m.requester}</td>
                    <td className="dim">{m.from}</td>
                    <td><Chip tone="info">{m.to ?? '-'}</Chip></td>
                    <td className="c">
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => {
                          const r = await moveAsset(m.id)
                          setMsg(r.message)
                        })}>이동 처리</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="cols c2">
        <Card kicker="Available" title={`배정 가능 재고 ${props.pool.length}건`} pad={false}>
          {poolEmpty ? (
            <div className="empty">유휴·검수중 재고가 없습니다. 반납 접수나 도입·검수로 확보됩니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>자산번호</th><th>모델</th><th className="c">유형</th><th>위치</th><th className="c">상태</th></tr></thead>
                <tbody>
                  {props.pool.map((p) => (
                    <tr key={p.assetNo}>
                      <td className="tnum">{p.assetNo}</td>
                      <td>{p.model}</td>
                      <td className="c dim">{p.category}</td>
                      <td className="dim">{p.location}</td>
                      <td className="c"><Chip tone={p.status === '유휴' ? 'ok' : 'neutral'}>{p.status}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card kicker="Fulfilled" title="처리 완료" pad={false}>
          {props.done.length === 0 ? (
            <div className="empty">처리 이력이 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th className="c">구분</th><th>건</th><th>신청자</th></tr></thead>
                <tbody>
                  {props.done.map((d) => (
                    <tr key={d.id}>
                      <td className="c"><Chip tone="ok">{d.kind}</Chip></td>
                      <td>{d.title}<div className="dim" style={{ fontSize: 11 }}>{d.id}</div></td>
                      <td>{d.requester}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
