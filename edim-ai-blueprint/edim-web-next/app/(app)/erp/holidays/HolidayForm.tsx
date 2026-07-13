'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addHoliday, type FormState } from './actions'

/** 공휴일 등록 폼 — 서버 액션(addHoliday) + useActionState. 성공 시 revalidate 로 그리드 자동 갱신. */
export function HolidayForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addHoliday, {})
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) formRef.current?.reset() }, [state.ok])

  return (
    <form ref={formRef} action={action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
      <label style={{ fontSize: 11 }}>날짜</label>
      <input name="date" type="date" className="in" style={{ height: 22, fontSize: 11 }} required />
      <label style={{ fontSize: 11 }}>공휴일명</label>
      <input name="name" className="in" placeholder="예: 광복절" style={{ height: 22, fontSize: 11, width: 160 }} required />
      <button type="submit" className="b pri" disabled={pending} style={{ height: 22, fontSize: 11 }}>
        {pending ? '등록 중…' : '＋ 등록'}
      </button>
      {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{state.error}</span> : null}
      {state.ok ? <span style={{ color: 'var(--ok)', fontSize: 10.5 }}>✓ {state.ok}</span> : null}
    </form>
  )
}
