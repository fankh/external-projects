import type { ReactNode } from 'react'

/** 화면 상단 qband — 서버 컴포넌트(정적). 제목·건수·SSR 출처 표기 (+우측 액션 슬롯).
 *  cap: 리스트 안전 상한(9.20/9.22, 기본 2000). count 가 상한에 도달하면 '상한' 칩으로
 *  절단 가능성을 정직하게 알린다(무음 상한 금지) — 검색·필터로 좁히도록 안내. */
export function ScreenHeader(props: { title: string; count?: number | string; source: string; countLabel?: string; cap?: number; right?: ReactNode }) {
  const capped = typeof props.count === 'number' && props.cap != null && props.count >= props.cap
  return (
    <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{props.title}</span>
      {props.count != null ? <span className="chip info">{props.count}{props.countLabel ?? '건'}</span> : null}
      {capped ? (
        <span className="chip warn" title={`최신 ${props.cap}건만 표시됩니다 (성능 상한). 검색·필터로 범위를 좁히십시오.`}>
          상한
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {props.right}
      <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · {props.source}</span>
    </div>
  )
}
