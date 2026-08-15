import Link from 'next/link'
import type { ReactNode } from 'react'
import type { RiskLevel } from '@/lib/types'

/** 화면 헤더 — 키커(도메인 코드) + 타이틀 + 설명 (제품안내서 페이지 헤더 문법) */
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

export function Stat(props: { value: ReactNode; label: string; tone?: 'accent' | 'warn' | 'err' | 'ok'; delta?: { text: string; dir: 'up' | 'down' | 'flat' }; href?: string }) {
  const cls = `stat ${props.tone && props.tone !== 'accent' ? props.tone : ''}`
  const inner = (
    <>
      <div className="v">{props.value}</div>
      <div className="l">{props.label}</div>
      {props.delta && <div className={`d ${props.delta.dir}`}>{props.delta.text}</div>}
    </>
  )
  // href 가 있으면 KPI 카드 자체를 상세로 가는 링크로 만든다(조치가 필요한 지표가 클릭으로 바로 이어지게)
  return props.href
    ? <Link href={props.href} className={cls} style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }} title="상세 화면으로 이동">{inner}</Link>
    : <div className={cls}>{inner}</div>
}

const RISK_TONE: Record<RiskLevel, string> = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' }

export function RiskChip({ risk }: { risk: RiskLevel }) {
  return <span className={`chip ${RISK_TONE[risk]}`}>{risk}</span>
}

export function Chip(props: { tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral'; children: ReactNode; bare?: boolean }) {
  return <span className={`chip ${props.tone} ${props.bare ? 'bare' : ''}`}>{props.children}</span>
}
