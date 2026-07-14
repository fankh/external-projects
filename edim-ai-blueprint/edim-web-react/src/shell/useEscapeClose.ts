/** F9 — 다이얼로그 Escape 닫기 표준 훅.
 *  active 인 동안 capture 단계에서 Escape 를 가로채 닫는다 —
 *  화면 단축키(CAD Esc·검색 Esc 등)로 전파되지 않도록 stopPropagation. */
import { useEffect } from 'react'

export function useEscapeClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [active, onClose])
}
