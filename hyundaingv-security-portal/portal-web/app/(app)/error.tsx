'use client'

/** 화면 오류 바운더리 — 렌더 크래시 시 셸을 유지한 채 복구 동선을 준다.
 *  청크 로드 오류는 ChunkReload 가 먼저 자동 새로고침으로 처리한다. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto', padding: '26px 30px', gap: 10 }}>
      <div className="kicker" style={{ color: 'var(--err)' }}>Error</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>화면 처리 중 오류가 발생했습니다</div>
      <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        일시적인 문제일 수 있습니다. 다시 시도해도 반복되면 관리자에게 아래 코드를 전달하세요.
      </p>
      {error.digest && <div className="mono dim" style={{ fontSize: 11.5 }}>digest: {error.digest}</div>}
      <div className="hstack" style={{ marginTop: 6 }}>
        <button type="button" className="btn pri" onClick={() => reset()}>다시 시도</button>
        <a className="btn" href="/dashboard">개인별현황으로 이동</a>
      </div>
    </div>
  )
}
