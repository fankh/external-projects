'use client'

/** 도면 대장 액션 패널 (N2) — 등록 폼 + 선택 도면의 Rev-up·단계 승인·Supersedure. */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { addSupersedure, createDrawing, decideStep, revUp, type ActState } from './actions'

export interface RevisionRow { rev: string; reason: string; date: string; by: string }
export interface StepRow { approvalId: number; step: string; result: string | null; comment: string | null; date: string | null; by: string | null }

export function DrawingRegForm() {
  const [st, action, pending] = useActionState(createDrawing, {} as ActState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="drawingNo" placeholder="도면번호 (KDCR …)" style={{ width: 120 }} />
      <input className="in req" name="name" placeholder="도면명" style={{ width: 150 }} />
      <select className="in" name="drawingType" defaultValue="PART" style={{ width: 92 }}>
        <option value="PART">PART</option><option value="ASSEMBLY">ASSEMBLY</option><option value="LAYOUT">LAYOUT</option>
      </select>
      <select className="in" name="kind" defaultValue="2D" style={{ width: 58 }}>
        <option value="2D">2D</option><option value="3D">3D</option>
      </select>
      <button className="b run" type="submit" disabled={pending}>＋ 도면 등록</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}

const STEPS = ['WRITE', 'REVIEW', 'APPROVE']

export function DrawingDetail({ no, revisions, steps }: { no: string; revisions: RevisionRow[]; steps: StepRow[] }) {
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [supNew, setSupNew] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const decided = new Map(steps.filter((s) => s.result).map((s) => [s.step, s]))
  const nextStep = STEPS.find((s) => !decided.get(s) || decided.get(s)?.result === 'REJECTED')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>도면 {no}</div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Rev 이력 — {revisions.length}건</div>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>Rev</th><th>사유</th><th>일자</th><th>작성</th></tr></thead>
          <tbody>{revisions.map((r) => (
            <tr key={r.rev}><td className="c code">{r.rev}</td><td>{r.reason || '—'}</td><td className="c">{r.date}</td><td className="c">{r.by}</td></tr>
          ))}</tbody>
        </table>
        <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder="Rev 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="b" disabled={pending} onClick={() => start(async () => {
            const r = await revUp(no, reason); setSt(r); if (r.ok) setReason('')
          })}>Rev 올리기</button>
        </div>
      </div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>단계 승인 (WRITE→REVIEW→APPROVE)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {STEPS.map((s) => {
            const d = decided.get(s)
            return <Chip key={s} tone={d?.result === 'APPROVED' ? 'ok' : d?.result === 'REJECTED' ? 'err' : s === nextStep ? 'warn' : 'info'}>
              {s}{d?.result ? ` ${d.result === 'APPROVED' ? '✓' : '✗'}` : s === nextStep ? ' (대기)' : ''}
            </Chip>
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder="결재 코멘트 (반려 필수)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="b run" disabled={pending || !nextStep} onClick={() => start(async () => {
            const r = await decideStep(no, nextStep!, true, comment); setSt(r); if (r.ok) setComment('')
          })}>{nextStep ?? '완료'} 승인</button>
          <button className="b" disabled={pending || !nextStep} onClick={() => start(async () => {
            const r = await decideStep(no, nextStep!, false, comment); setSt(r); if (r.ok) setComment('')
          })}>반려</button>
        </div>
      </div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Supersedure — 이 도면을 신도면으로 대체</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder="신도면 번호" value={supNew} onChange={(e) => setSupNew(e.target.value)} />
          <button className="b" disabled={pending} onClick={() => start(async () => {
            const r = await addSupersedure(no, supNew, '대체 등록'); setSt(r); if (r.ok) setSupNew('')
          })}>대체 등록</button>
        </div>
      </div>

      {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
    </div>
  )
}
