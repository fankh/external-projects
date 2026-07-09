/** F-key 표준 (레거시 문법): F2 신규 · F3 삭제 · F8 조회 · F9 Run · F12 저장.
 *  활성 MDI 탭의 화면만 핸들러를 등록한다 (active=false 면 무시). */
import { useEffect } from 'react'

export type FKeyHandlers = Partial<Record<'F2' | 'F3' | 'F5' | 'F8' | 'F9' | 'F12', () => void>>

export function useFKeys(active: boolean, handlers: FKeyHandlers) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const h = handlers[e.key as keyof FKeyHandlers]
      if (h) {
        e.preventDefault()
        // Shell 의 F-key 폴백에 "화면이 처리했음"을 알림 (미구현 안내 억제)
        ;(e as KeyboardEvent & { __handled?: boolean }).__handled = true
        h()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, handlers])
}
