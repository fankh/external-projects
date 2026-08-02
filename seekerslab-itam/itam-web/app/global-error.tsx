'use client'
import { useEffect, useState } from 'react'

/** 루트 레벨 클라이언트 크래시 대체 화면 — Next 기본 "Application error" 대신 부드럽게 복구한다.
 *  대개 배포 후 청크 해시가 바뀐 스테일 번들이 원인이므로, 세션당 한 번 새로고침해 최신 번들을 받는다.
 *  새로고침 후에도 계속되면(진짜 오류) 가드가 걸려 안내 화면과 재시도 버튼을 보여준다. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(true)

  useEffect(() => {
    if (!sessionStorage.getItem('__chunkReloaded')) {
      sessionStorage.setItem('__chunkReloaded', '1')
      location.reload()
    } else {
      setReloading(false)
    }
  }, [])

  return (
    <html lang="ko">
      <body style={{ fontFamily: '-apple-system, "Segoe UI", "Malgun Gothic", sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#f4f5f7', color: '#14161a' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 24 }}>
          {reloading ? (
            <p style={{ color: '#5b6470' }}>최신 버전을 불러오는 중입니다…</p>
          ) : (
            <>
              <div style={{ fontSize: 12, letterSpacing: '.08em', color: '#5b6470', fontWeight: 700 }}>SEEKERSLAB ITAM</div>
              <h2 style={{ margin: '8px 0' }}>일시적인 오류가 발생했습니다</h2>
              <p style={{ color: '#5b6470', fontSize: 14, lineHeight: 1.7 }}>
                계속되면 새로고침(Ctrl+Shift+R) 하거나 다시 시도해 주세요.
              </p>
              <button
                onClick={() => { sessionStorage.removeItem('__chunkReloaded'); reset() }}
                style={{ marginTop: 14, padding: '8px 18px', border: '1px solid #1f6feb', background: '#1f6feb', color: '#fff', borderRadius: 6, cursor: 'pointer', font: 'inherit' }}>
                다시 시도
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  )
}
