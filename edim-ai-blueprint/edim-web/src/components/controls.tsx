/** Dense 소형 컨트롤 — 22px 체계 (디자인시안 b02). */
import type { CSSProperties, ReactNode } from 'react'

export function Btn(props: {
  children: ReactNode
  variant?: 'default' | 'pri' | 'run' | 'ic'
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: CSSProperties
}) {
  const cls = ['b', props.variant && props.variant !== 'default' ? props.variant : '']
    .filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={props.onClick}
      disabled={props.disabled} title={props.title} style={props.style}>
      {props.children}
    </button>
  )
}

export function Combo(props: {
  value: string
  options: string[]
  onChange?: (v: string) => void
  width?: number
  disabled?: boolean
}) {
  return (
    <select className="cb2" style={{ width: props.width }} value={props.value}
      disabled={props.disabled} onChange={(e) => props.onChange?.(e.target.value)}>
      {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export function Chip(props: { tone: 'ok' | 'warn' | 'err' | 'info'; children: ReactNode }) {
  return <span className={`st ${props.tone}`}>{props.children}</span>
}

export function GroupBox(props: {
  title: ReactNode
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
  noPad?: boolean
}) {
  return (
    <div className="gb" style={props.style}>
      <div className="gt">{props.title}<span className="sp" />{props.right}</div>
      <div className={props.noPad ? 'gc p0' : 'gc'}>{props.children}</div>
    </div>
  )
}

export function Fx(props: { children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return <div className={props.dark ? 'fx dark' : 'fx'} style={props.style}>{props.children}</div>
}

export function Sep() {
  return <span className="sep" />
}
