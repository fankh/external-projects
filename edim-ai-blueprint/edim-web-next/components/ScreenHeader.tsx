/** 화면 상단 qband — 서버 컴포넌트(정적). 제목·건수·SSR 출처 표기. */
export function ScreenHeader(props: { title: string; count?: number | string; source: string; countLabel?: string }) {
  return (
    <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{props.title}</span>
      {props.count != null ? <span className="chip info">{props.count}{props.countLabel ?? '건'}</span> : null}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · {props.source}</span>
    </div>
  )
}
