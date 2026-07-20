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

export function GroupBox({ title, right, children, style, noPad, ...rest }: {
  title: ReactNode
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
  noPad?: boolean
} & Record<`data-${string}`, string | boolean | undefined>) {
  // data-* 패스스루 — Btn 과 동일 (typed props 만 받으면 E2E 마커가 무음 드랍되는 함정, v34.20/43)
  return (
    <div className="gb" style={style} {...rest}>
      <div className="gt">{title}<span className="sp" />{right}</div>
      <div className={noPad ? 'gc p0' : 'gc'}>{children}</div>
    </div>
  )
}

export function Fx(props: { children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return <div className={props.dark ? 'fx dark' : 'fx'} style={props.style}>{props.children}</div>
}

export function Sep() {
  return <span className="sep" />
}
