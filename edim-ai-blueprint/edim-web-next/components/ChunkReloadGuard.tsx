'use client'

/** 배포 창(container swap) 중 stale JS 청크 로드 실패 자동 복구.
 *  immutable 해시 청크 + 컨테이너 재기동 특성상, 브라우저가 구 HTML 을 들고 있으면
 *  갱신된 컨테이너에 없는 청크명을 요청해 ChunkLoadError → "client-side exception" 이 뜬다.
 *  이 가드는 그 오류를 감지해 1회 하드 리로드로 최신 HTML+청크를 받아 자동 복구한다(무한 루프 방지: 세션당 1회). */
import { useEffect } from 'react'

const KEY = 'edim-chunk-reloaded'

export function ChunkReloadGuard() {
  useEffect(() => {
    const isChunkErr = (msg: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|error loading dynamically imported module|Importing a module script failed/i.test(msg)

    const recover = (msg: string) => {
      if (!isChunkErr(msg)) return
      if (sessionStorage.getItem(KEY)) return   // 이미 1회 리로드함 — 재시도 안 함(루프 방지)
      sessionStorage.setItem(KEY, '1')
      location.reload()
    }
    const onErr = (e: ErrorEvent) => recover(e.message || String(e.error ?? ''))
    const onRej = (e: PromiseRejectionEvent) => recover(String((e.reason as { message?: string })?.message ?? e.reason ?? ''))

    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    // 정상 로드가 끝나면 플래그 정리(다음 배포 창에서 다시 1회 복구 가능하도록)
    const clear = setTimeout(() => sessionStorage.removeItem(KEY), 4000)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      clearTimeout(clear)
    }
  }, [])
  return null
}
