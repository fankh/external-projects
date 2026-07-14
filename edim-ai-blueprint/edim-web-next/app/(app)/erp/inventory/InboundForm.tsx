'use client'

import { useActionState, useEffect, useRef } from 'react'
import { usePermission } from '@/components/PermissionProvider'
import { inbound, type FormState } from './actions'

export function InboundForm() {
  const { canWrite, denyWrite } = usePermission()
  const writable = canWrite('inventory')
  const [state, action, pending] = useActionState<FormState, FormData>(inbound, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) { ref.current?.reset() } }, [state.ok])

  const inp = { height: 22, fontSize: 11 } as const
  return (
    <form ref={ref} action={action} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 11 }}>입고</label>
      <input name="itemCode" className="in" placeholder="품목코드" style={{ ...inp, width: 90 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>위치</label>
      <input name="locationCode" className="in" defaultValue="GEN-A01" style={{ ...inp, width: 90 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>수량</label>
      <input name="quantity" className="in" defaultValue="1" style={{ ...inp, width: 56 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>Lot</label>
      <input name="lotNo" className="in" placeholder="선택" style={{ ...inp, width: 70 }} disabled={!writable} />
      <label style={{ fontSize: 11 }}>S/N</label>
      <input name="serialNo" className="in" placeholder="선택" style={{ ...inp, width: 70 }} disabled={!writable} />
      <label style={{ fontSize: 11 }}>단가</label>
      <input name="unitPrice" className="in" placeholder="STOCK 자동" style={{ ...inp, width: 78 }} disabled={!writable} />
      <button type="submit" className="b pri" disabled={pending || !writable} title={writable ? '' : denyWrite} style={inp}>{pending ? '입고 중…' : '입고'}</button>
      {!writable ? <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>🔒 {denyWrite}</span> : null}
      {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{state.error}</span> : null}
      {state.ok ? <span style={{ color: 'var(--ok)', fontSize: 10.5 }}>✓ {state.ok}</span> : null}
    </form>
  )
}
