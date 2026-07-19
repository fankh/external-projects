/** 서버측 페이지 가드 결과 — 진입 권한 없음 표준 화면(서버 컴포넌트). */
export function AccessDenied({ minLevel }: { minLevel: string }) {
  return (
    <div data-access-denied style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--txt-mute)' }}>
      <div style={{ fontSize: 26 }}>🔒</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>접근 권한이 없습니다</div>
      <div style={{ fontSize: 11 }}>이 화면은 {minLevel} 이상 등급만 진입할 수 있습니다 (RBAC).</div>
    </div>
  )
}
