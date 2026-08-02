import type { ReactNode } from 'react'

/** 화면 헤더 — 키커(도메인) + 타이틀 + 설명 */
export function ScreenHeader(props: { kicker: string; title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="screen-hd">
      <div>
        <div className="kicker">{props.kicker}</div>
        <div className="tt">{props.title}</div>
        {props.desc && <div className="desc">{props.desc}</div>}
      </div>
      <div className="sp" />
      {props.right}
    </div>
  )
}

export function Card(props: { title?: string; kicker?: string; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {(props.title || props.actions) && (
        <div className="card-hd">
          <div>
            {props.kicker && <div className="kicker mute">{props.kicker}</div>}
            {props.title && <div className="tt">{props.title}</div>}
          </div>
          <div className="sp" />
          {props.actions}
        </div>
      )}
      <div className={`card-bd ${props.pad === false ? 'p0' : ''}`}>{props.children}</div>
    </section>
  )
}

export function Stat(props: { value: ReactNode; label: string; tone?: 'warn' | 'err'; note?: string }) {
  return (
    <div className={`stat ${props.tone ?? ''}`}>
      <div className="v">{props.value}</div>
      <div className="l">{props.label}</div>
      {props.note && <div className="d">{props.note}</div>}
    </div>
  )
}

export function Chip(props: { tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral'; children: ReactNode; bare?: boolean }) {
  return <span className={`chip ${props.tone} ${props.bare ? 'bare' : ''}`}>{props.children}</span>
}

/** 첨부 표시 — 공통 첨부(refId 기준) 건수. 0이면 렌더하지 않는다. */
export function Clip({ count, title }: { count: number; title?: string }) {
  if (count <= 0) return null
  return <span className="clip" title={title}>📎{count}</span>
}
