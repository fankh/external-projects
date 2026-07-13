'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addCompany, type FormState } from './actions'

export function CompanyForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addCompany, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
      <label style={{ fontSize: 11 }}>업체명</label>
      <input name="name" className="in" style={{ height: 22, fontSize: 11, width: 160 }} required />
      <label style={{ fontSize: 11 }}>유형</label>
      <select name="companyType" className="in" defaultValue="SUPPLIER" style={{ height: 22, fontSize: 11 }}>
        {['SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <label style={{ fontSize: 11 }}>국가</label>
      <input name="nation" className="in" defaultValue="KR" style={{ height: 22, fontSize: 11, width: 56 }} />
      <button type="submit" className="b pri" disabled={pending} style={{ height: 22, fontSize: 11 }}>
        {pending ? '등록 중…' : '＋ 등록'}
      </button>
      {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{state.error}</span> : null}
      {state.ok ? <span style={{ color: 'var(--ok)', fontSize: 10.5 }}>✓ {state.ok}</span> : null}
    </form>
  )
}
