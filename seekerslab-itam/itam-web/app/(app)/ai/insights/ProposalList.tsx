'use client'
import { useMemo, useState, useTransition } from 'react'
import { Card, Chip, RiskChip } from '@/components/ui'
import type { AiInsight } from '@/lib/types'
import { decideInsight } from './actions'

export function ProposalList({ insights }: { insights: AiInsight[] }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  // 제안이 판정 이력과 섞여 쌓이므로 상태·기능·심각도 필터. 기본은 '제안'(처리 대기)을 먼저 보여준다.
  const [fstatus, setFstatus] = useState<'전체' | '제안' | '승인' | '반려'>('제안')
  const [fkind, setFkind] = useState('전체')
  const [fsev, setFsev] = useState('전체')
  const [pending, startTransition] = useTransition()

  const kinds = useMemo(() => ['전체', ...[...new Set(insights.map((i) => i.kind))]], [insights])
  const rows = useMemo(() => insights.filter((i) => {
    if (fstatus !== '전체' && i.status !== fstatus) return false
    if (fkind !== '전체' && i.kind !== fkind) return false
    if (fsev !== '전체' && i.severity !== fsev) return false
    return true
  }), [insights, fstatus, fkind, fsev])

  const run = (id: string, verdict: '승인' | '반려', why = '') =>
    startTransition(async () => {
      const r = await decideInsight(id, verdict, why)
      setMsg(r.message)
      if (r.ok) { setRejecting(null); setReason('') }
    })

  return (
    <Card kicker="Proposals" title="AI 제안 — 판정 대기 및 이력" pad={false}>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="qbar" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <div className="seg">
          {(['제안', '승인', '반려', '전체'] as const).map((st) => (
            <button key={st} className={fstatus === st ? 'on' : ''} onClick={() => setFstatus(st)}>{st}</button>
          ))}
        </div>
        <select className="select" value={fkind} onChange={(e) => setFkind(e.target.value)} style={{ maxWidth: 150 }}>
          {kinds.map((k) => <option key={k} value={k}>{k === '전체' ? '기능 — 전체' : k}</option>)}
        </select>
        <select className="select" value={fsev} onChange={(e) => setFsev(e.target.value)} style={{ maxWidth: 120 }}>
          {['전체', '높음', '중간', '낮음'].map((sv) => <option key={sv} value={sv}>{sv === '전체' ? '심각도 — 전체' : sv}</option>)}
        </select>
        <span className="cnt">{rows.length}건 / 전체 {insights.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>ID</th><th>기능</th><th className="c">심각도</th><th>제안</th><th>근거</th><th>일자</th><th className="c">상태</th><th className="c">판정</th></tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="code">{i.id}</td>
                <td className="mute">{i.kind}</td>
                <td className="c"><RiskChip risk={i.severity} /></td>
                <td style={{ whiteSpace: 'normal', maxWidth: 440 }}>
                  <div className="strong" style={{ whiteSpace: 'normal' }}>{i.title}</div>
                  <div className="dim" style={{ fontSize: 11.5, whiteSpace: 'normal' }}>{i.detail}</div>
                  {i.action && <div style={{ fontSize: 11.5, marginTop: 3 }}><Chip tone="ok">조치 — {i.action}</Chip></div>}
                  {i.rejectReason && <div style={{ fontSize: 11.5, marginTop: 3 }}><Chip tone="err">오탐 사유 — {i.rejectReason}</Chip></div>}
                  {rejecting === i.id && (
                    <div className="hstack" style={{ gap: 6, marginTop: 6 }}>
                      <input className="input" style={{ flex: 1 }} autoFocus
                        placeholder="반려 사유 (오탐 유형) — 재학습 신호로 기록됩니다"
                        value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button className="btn sm danger" disabled={pending || !reason.trim()}
                        onClick={() => run(i.id, '반려', reason)}>반려 확정</button>
                      <button className="btn sm" disabled={pending}
                        onClick={() => { setRejecting(null); setReason('') }}>취소</button>
                    </div>
                  )}
                </td>
                <td className="mute" style={{ fontSize: 11.5 }}>{i.evidence}</td>
                <td className="tnum">{i.createdAt.slice(5)}</td>
                <td className="c">
                  <Chip tone={i.status === '승인' ? 'ok' : i.status === '반려' ? 'err' : 'info'}>{i.status}</Chip>
                </td>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  {i.status === '제안' ? (
                    <>
                      <button className="btn sm pri" disabled={pending} onClick={() => run(i.id, '승인')}>승인</button>{' '}
                      <button className="btn sm" disabled={pending} onClick={() => setRejecting(i.id)}>반려</button>
                    </>
                  ) : (
                    <span className="mut" style={{ fontSize: 11.5 }}>{i.decidedBy} · {i.decidedAt}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><div className="empty">{insights.length === 0 ? 'AI 제안이 없습니다' : '조건에 맞는 제안이 없습니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
