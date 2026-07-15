'use client'

/** ECR 등록 폼 (N2) — 영향 분석 자동 첨부. */
import { useActionState } from 'react'
import { createEcr, type EcrState } from './actions'

export function EcrForm() {
  const [st, action, pending] = useActionState(createEcr, {} as EcrState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="title" placeholder="변경 제목" style={{ width: 180 }} />
      <select className="in" name="targetType" defaultValue="DRAWING" style={{ width: 86 }}>
        <option value="DRAWING">도면</option><option value="CODE">코드</option>
      </select>
      <input className="in req" name="targetNo" placeholder="대상 번호 (도면/코드)" style={{ width: 140 }} />
      <input className="in" name="newDrawingNo" placeholder="신도면 번호 (대체 시)" style={{ width: 140 }} />
      <input className="in" name="reason" placeholder="변경 사유" style={{ width: 170 }} />
      <button className="b run" type="submit" disabled={pending}>＋ ECR 등록</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}
