'use client'

/** Dense 소형 컨트롤 — 22px 체계 (디자인시안 b02). */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

/** 4.1 #16 — Accordion Template Host 가 주입하는 접기 컨텍스트.
 *  컨텍스트가 있으면 GroupBox 의 제목줄이 곧 아코디언 헤더가 된다
 *  (패널마다 별도 헤더를 덧대면 제목이 두 번 나오므로). */
export const AccordionCtx = createContext<{ open: boolean; toggle: () => void } | null>(null)

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
  const acc = useContext(AccordionCtx)
  if (acc) {
    return (
      <div className="gb" style={style} {...rest}>
        <div className="gt" data-acc-header onClick={acc.toggle}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title={acc.open ? '접기' : '펼치기'}>
          <span style={{ fontSize: 9, marginRight: 3 }}>{acc.open ? '▾' : '▸'}</span>
          {title}<span className="sp" />{right}
        </div>
        {/* 접힘에도 언마운트하지 않는다 — 입력 중이던 값이 사라지지 않도록 */}
        {/* 컨텍스트는 여기서 끊는다 — 안쪽 GroupBox 까지 아코디언 헤더가 되면 안 된다 */}
        <div className={noPad ? 'gc p0' : 'gc'} data-acc-body
          style={acc.open ? undefined : { display: 'none' }}>
          <AccordionCtx.Provider value={null}>{children}</AccordionCtx.Provider>
        </div>
      </div>
    )
  }
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
