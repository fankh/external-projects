'use client'

/** 루트 오류 바운더리 — 레이아웃 자체가 죽었을 때의 최후 폴백 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'Pretendard, Malgun Gothic, sans-serif', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 6, padding: '28px 32px', width: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: '#b91c1c', textTransform: 'uppercase' }}>Fatal Error</div>
          <h1 style={{ fontSize: 19, margin: '8px 0' }}>포털을 표시할 수 없습니다</h1>
          <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.7 }}>
            잠시 후 다시 시도하세요. 반복되면 관리자에게 문의하세요.
            {error.digest ? ` (digest: ${error.digest})` : ''}
          </p>
          <button type="button" onClick={() => reset()}
            style={{ marginTop: 10, height: 32, padding: '0 16px', fontSize: 12.5, fontWeight: 600, background: '#18181b', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
