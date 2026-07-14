'use client'

import { useActionState, useEffect, useRef } from 'react'
import { usePermission } from '@/components/PermissionProvider'
import { recordActual, type FormState } from './actions'

export function ActualForm() {
  const { canWrite, denyWrite } = usePermission()
  const writable = canWrite('cost_actual')
  const [state, action, pending] = useActionState<FormState, FormData>(recordActual, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])
  const inp = { height: 22, fontSize: 11 } as const
  return (
    <form ref={ref} action={action} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 11 }}>분류</label>
      <select name="category" className="in" defaultValue="MATERIAL" style={inp} disabled={!writable}>
        <option value="MATERIAL">재료비</option>
        <option value="MANUFACTURING">제조비</option>
        <option value="DIRECT">직접경비</option>
      </select>
      <label style={{ fontSize: 11 }}>품목</label>
      <input name="itemName" className="in" placeholder="예: Casing" style={{ ...inp, width: 120 }} disabled={!writable} />
      <label style={{ fontSize: 11 }}>PO</label>
      <input name="poNo" className="in" placeholder="선택" style={{ ...inp, width: 80 }} disabled={!writable} />
      <label style={{ fontSize: 11 }}>수량</label>
      <input name="qty" className="in" defaultValue="1" style={{ ...inp, width: 48 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>단가</label>
      <input name="unitPrice" className="in" defaultValue="0" style={{ ...inp, width: 80 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>프로젝트</label>
      <input name="projectNo" className="in" placeholder="PS-… 선택" style={{ ...inp, width: 84 }} disabled={!writable} />
      <button type="submit" className="b pri" disabled={pending || !writable} title={writable ? '' : denyWrite} style={inp}>{pending ? '적재 중…' : '실적 적재'}</button>
      {!writable ? <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>🔒 {denyWrite}</span> : null}
      {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{state.error}</span> : null}
      {state.ok ? <span style={{ color: 'var(--ok)', fontSize: 10.5 }}>✓ {state.ok}</span> : null}
    </form>
  )
}
