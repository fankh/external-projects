'use client'
import { useEffect } from 'react'

/** 배포로 청크 해시가 바뀌면, 이전 버전을 열어둔 브라우저가 사라진 청크를 불러오다 실패해
 *  "client-side exception" 으로 죽는다. 그 오류를 잡아 한 번 새로고침해 최신 번들을 받게 한다.
 *  (itam-web 에서 재배포마다 열려 있던 세션이 크래시하던 것을 자동 복구한 검증 패턴) */
export function ChunkReload() {
  useEffect(() => {
    const isChunkErr = (msg?: string) =>
      /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported|Loading CSS chunk|importing a module script failed|error loading dynamically imported module/i.test(msg ?? '')
    const reloadOnce = () => {
      // 무한 새로고침 방지 — 세션당 1회만
      if (sessionStorage.getItem('__chunkReloaded')) return
      sessionStorage.setItem('__chunkReloaded', '1')
      location.reload()
    }
    const onErr = (e: ErrorEvent) => {
      // 스크립트/스타일시트 로드 실패(청크 404)는 캡처 단계에서만 잡히고 message 가 비어 있다 — 대상 요소로 판별한다
      const el = e.target as (HTMLScriptElement & HTMLLinkElement) | null
      const src = el?.src || el?.href || ''
      const tag = el?.tagName
      if (((tag === 'SCRIPT' || tag === 'LINK') && /\/_next\/(static|.*chunk)/.test(src)) || isChunkErr(e.message) || isChunkErr((e.error as Error | undefined)?.message)) reloadOnce()
    }
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined
      if (isChunkErr(typeof r === 'string' ? r : r?.message)) reloadOnce()
    }
    window.addEventListener('error', onErr, true) // capture — 리소스 로드 오류는 버블링하지 않는다
    window.addEventListener('unhandledrejection', onRej)
    // 정상 로드가 유지되면 가드를 풀어, 다음 배포에서 다시 자동 복구되게 한다
    const t = setTimeout(() => sessionStorage.removeItem('__chunkReloaded'), 8000)
    return () => {
      window.removeEventListener('error', onErr, true)
      window.removeEventListener('unhandledrejection', onRej)
      clearTimeout(t)
    }
  }, [])
  return null
}
