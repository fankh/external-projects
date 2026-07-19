'use client'

import { useActionState } from 'react'
import { loginAction, type LoginState } from './actions'

export interface LoginLabels { title: string; userId: string; password: string; submit: string; checking: string }

export function LoginForm({ next, labels }: { next: string; labels: LoginLabels }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  return (
    <form action={action} className="login-dlg" style={{
      width: 300, background: '#fff', border: '1px solid var(--line-strong)',
      boxShadow: '0 8px 30px rgba(20,26,40,.35)', padding: 0,
    }}>
      <div className="titlebar" style={{ padding: '6px 10px', fontSize: 12 }}><b>{labels.title}</b></div>
      <div className="frm c2" style={{ padding: 12 }}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="userId">{labels.userId}</label>
        <input id="userId" name="userId" className="in" defaultValue="edim" autoFocus />
        <label htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" className="in" defaultValue="edim" />
      </div>
      {state.error ? <div style={{ color: 'var(--err)', fontSize: 11, padding: '0 12px 6px' }}>{state.error}</div> : null}
      <div style={{ padding: '0 12px 12px', textAlign: 'right' }}>
        <button type="submit" className="b pri" disabled={pending} style={{ height: 26 }}>
          {pending ? labels.checking : labels.submit}
        </button>
      </div>
    </form>
  )
}
