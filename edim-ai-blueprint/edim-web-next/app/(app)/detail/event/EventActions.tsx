'use client'

/** 이벤트 상세 액션 — 완료·재배정·에스컬레이션 아일랜드 (N1 복구). */
import { useState, useTransition } from 'react'
import { completeEvent, escalateEvent, reassignEvent, type EventActionState } from '@/app/(app)/erp/tasks/actions'

export function EventActions({ eventId, status }: { eventId: number; status: string }) {
  const [comment, setComment] = useState('')
  const [assignee, setAssignee] = useState('')
  const [st, setSt] = useState<EventActionState>({})
  const [pending, start] = useTransition()
  const done = status === 'DONE'

  return (
    <div className="gb" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600 }}>이벤트 처리</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 200 }} placeholder="처리/재배정 의견"
          value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="b run" disabled={pending || done} title={done ? '이미 완료됨' : undefined}
          onClick={() => start(async () => setSt(await completeEvent(eventId, comment)))}>완료 처리</button>
        <span className="sep" />
        <input className="in" style={{ width: 120 }} placeholder="재배정 담당 ID"
          value={assignee} onChange={(e) => setAssignee(e.target.value)} />
        <button className="b" disabled={pending || done}
          onClick={() => start(async () => setSt(await reassignEvent(eventId, assignee, comment)))}>재배정</button>
        <span className="sep" />
        <button className="b" disabled={pending}
          onClick={() => start(async () => setSt(await escalateEvent(eventId, comment)))}>에스컬레이션</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </div>
  )
}
