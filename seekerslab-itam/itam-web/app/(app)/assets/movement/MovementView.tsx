'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { issueAsset, moveAsset } from './actions'

type Issue = { id: string; title: string; requester: string; dept: string; requestedAt: string; note?: string; desiredCategory?: string }
type Move = {
  id: string; title: string; requester: string; requestedAt: string
  assetNo?: string; model: string; from: string; to?: string; blocked?: string
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

      {/* 사이 카드(배정 가능 재고 N건)는 건수를 적는데 처리 대기 두 카드만 안 적었다 — 대시보드
          '불출 · 이동 집행 대기' 큐가 세는 집합이 이 둘의 합이라, 큐가 말한 수를 화면에서 맞대 볼 자리가 없었다. */}
      <Card id="issue" kicker="Phase 3 · Issue" title={`불출 대기 ${props.issues.length}건 — 승인된 자산 신청`} pad={false}
        // 대시보드 '불출 · 이동 집행 대기' 큐는 이 카드와 아래 이동 카드의 합을 센다 — 카드마다 제 건수만
        //  적어 두면 큐가 말한 수(합계)를 화면 어디에서도 맞대 볼 수 없다. 큐가 내려앉는 이 카드에 합계를 적는다.
        actions={<span className="dim" style={{ fontSize: 11.5 }}>집행 대기 합계 <span data-queue="#issue">{props.issues.length + props.moves.length}</span>건 (불출 {props.issues.length} · 이동 {props.moves.length})</span>}>
        {props.issues.length === 0 ? (
          <div className="empty">불출 처리할 승인 건이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>결재</th><th>신청자</th><th className="c">승인일</th><th>배정 자산 (유휴 재고)</th><th>불출 위치</th><th /></tr>
              </thead>
              <tbody>
                {props.issues.map((a) => {
                  // 재배치 우선 원칙 — 희망 유형과 같은 유휴 재고를 우선 추천한다. 일치 재고를 앞에 두고 기본 선택으로 삼되,
                  // 담당자가 다른 유형을 고를 수도 있어(예: 대체 지급) 제한이 아닌 경고로 안내한다.
                  const want = a.desiredCategory
                  const matched = want ? props.pool.filter((p) => p.category === want) : []
                  const ordered = want ? [...matched, ...props.pool.filter((p) => p.category !== want)] : props.pool
                  const defaultSel = matched[0]?.assetNo ?? props.pool[0]?.assetNo ?? ''
                  const curSel = sel[a.id] ?? defaultSel
                  const curCat = props.pool.find((p) => p.assetNo === curSel)?.category
                  const mismatch = Boolean(want && curCat && curCat !== want)
                  const noMatch = Boolean(want && matched.length === 0 && !poolEmpty)
                  return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{a.id}{a.note ? ` · ${a.note}` : ''}</div>
                      {want && <Chip tone="info" bare>희망 유형 {want}</Chip>}
                    </td>
                    <td>{a.requester}<div className="dim" style={{ fontSize: 11 }}>{a.dept}</div></td>
                    <td className="c tnum">{a.requestedAt}</td>
                    <td>
                      <select aria-label="이동 처리 선택" className="select" style={{ minWidth: 240 }} disabled={poolEmpty}
                        value={curSel}
                        onChange={(e) => setSel((m) => ({ ...m, [a.id]: e.target.value }))}>
                        {poolEmpty
                          ? <option>배정 가능한 유휴 재고 없음</option>
                          : ordered.map((p) => (
                              <option key={p.assetNo} value={p.assetNo}>
                                {`${want && p.category === want ? '✓ ' : ''}${p.assetNo} · ${p.model} · ${p.category} (${p.status})`}
                              </option>
                            ))}
                      </select>
                      {mismatch && <div style={{ marginTop: 3 }}><Chip tone="warn" bare>유형 불일치 — 신청 {want} / 배정 {curCat}</Chip></div>}
                      {noMatch && <div style={{ marginTop: 3 }}><Chip tone="warn" bare>일치 유형({want}) 유휴 재고 없음 — 신규 구매 검토</Chip></div>}
                    </td>
                    <td>
                      <select aria-label="이동 목적지" className="select" value={loc[a.id] ?? props.locations[0] ?? ''}
                        onChange={(e) => setLoc((m) => ({ ...m, [a.id]: e.target.value }))}>
                        {props.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="c">
                      <button className="btn sm pri" disabled={pending || poolEmpty}
                        onClick={() => startTransition(async () => {
                          const r = await issueAsset(a.id, curSel, loc[a.id] ?? props.locations[0])
                          setMsg(r.message)
                        })}>불출 처리</button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="move" kicker="Phase 3 · Move" title={`이동 대기 ${props.moves.length}건 — 승인된 이동 신청`} pad={false}>
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
                      {/* 분실·폐기 경로 자산은 서버가 이동을 거부한다 — 버튼을 잠그고 이유를 적는다(누르고 나서 알게 되지 않게).
                          신청은 목록에 남긴다: 반려·취소로 정리해야 할 건이라 조용히 감추면 미결로 방치된다. */}
                      {m.blocked
                        ? <span className="mut" style={{ fontSize: 11 }} title="자산이 분실·폐기 경로로 떠나 이동을 집행할 수 없습니다 — 신청을 반려·취소로 정리하세요">
                            처리 불가 ({m.blocked})
                          </span>
                        : <button className="btn sm pri" disabled={pending}
                            onClick={() => startTransition(async () => {
                              const r = await moveAsset(m.id)
                              setMsg(r.message)
                            })}>이동 처리</button>}
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
