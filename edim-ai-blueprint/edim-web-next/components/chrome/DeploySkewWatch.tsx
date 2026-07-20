'use client'

/** 1.1 — 배포 스큐 감지 배너.
 *
 * autodeploy 로 서버가 새 빌드로 교체되면 열린 탭의 Server Action ID 가 무효가 되어
 * 저장·등록이 "Failed to find Server Action" 으로 조용히 실패한다(운영 로그 24h 35건).
 * 빌드 ID 를 주기적으로 대조해 바뀌면 새로고침을 안내한다.
 */
import { useEffect, useState } from 'react'

export function DeploySkewWatch({ buildId }: { buildId: string }) {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      if (!alive || document.hidden) return
      try {
        const r = await fetch('/api/next/build', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { buildId?: string }
        if (alive && d.buildId && d.buildId !== buildId) setStale(true)
      } catch { /* 네트워크 순단 무시 — 다음 주기 재시도 */ }
    }
    const id = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', check) }
  }, [buildId])

  if (!stale) return null
  return (
    <div data-deploy-skew
      style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 500, background: '#FFF3C2',
        border: '1px solid var(--line-strong)', boxShadow: '0 4px 12px rgba(20,26,40,.25)',
        padding: '8px 10px', fontSize: 11, display: 'flex', gap: 8, alignItems: 'center' }}>
      <span>새 버전이 배포되었습니다 — 저장 실패를 막으려면 새로고침하십시오</span>
      <button className="b run" onClick={() => window.location.reload()}>새로고침</button>
    </div>
  )
}
