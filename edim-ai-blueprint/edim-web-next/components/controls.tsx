'use client'

/** Dense 소형 컨트롤 — 22px 체계 (디자인시안 b02). */
import type { CSSProperties, ReactNode } from 'react'

export function Btn({ children, variant, onClick, disabled, title, style, ...rest }: {
  children: ReactNode
  variant?: 'default' | 'pri' | 'run' | 'ic'
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: CSSProperties
} & Record<`data-${string}`, string | boolean>) {
  const cls = ['b', variant && variant !== 'default' ? variant : '']
    .filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onClick}
      disabled={disabled} title={title} style={style} {...rest}>
      {children}
    </button>
  )
}

/** 옵션은 문자열 또는 {value,label} — 값(필터 키)은 유지하고 표시만 번역할 때 label 사용 */
export type ComboOption = string | { value: string; label: string }

export function Combo(props: {
  value: string
  options: ComboOption[]
  onChange?: (v: string) => void
  width?: number
  disabled?: boolean
}) {
  return (
    <select className="cb2" style={{ width: props.width }} value={props.value}
      disabled={props.disabled} onChange={(e) => props.onChange?.(e.target.value)}>
      {props.options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        return <option key={v} value={v}>{l}</option>
      })}
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
