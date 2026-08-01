'use client'
import { useState, useTransition } from 'react'
import { Card, Chip, RiskChip } from '@/components/ui'
import type { AiInsight } from '@/lib/types'
import { decideInsight } from './actions'

export function ProposalList({ insights }: { insights: AiInsight[] }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (id: string, verdict: '승인' | '반려', why = '') =>
    startTransition(async () => {
      const r = await decideInsight(id, verdict, why)
      setMsg(r.message)
      if (r.ok) { setRejecting(null); setReason('') }
    })

  return (
    <Card kicker="Proposals" title="AI 제안 — 판정 대기 및 이력" pad={false}>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>ID</th><th>기능</th><th className="c">심각도</th><th>제안</th><th>근거</th><th>일자</th><th className="c">상태</th><th className="c">판정</th></tr>
          </thead>
          <tbody>
            {insights.map((i) => (
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
          </tbody>
        </table>
      </div>
    </Card>
  )
}
