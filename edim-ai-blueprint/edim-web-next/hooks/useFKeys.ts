'use client'

/** F-key 수신 훅 (N6 복구) — 셸(상태바·전역 keydown)이 발행하는 'edim-fkey' 를 화면 아일랜드가 구독.
 *  사용: useFKeys({ F12: save, F9: run }) — 등록된 키만 처리. */
import { useEffect, useRef } from 'react'

export type FKeyMap = Partial<Record<'F2' | 'F3' | 'F5' | 'F8' | 'F9' | 'F12', () => void>>

export function useFKeys(map: FKeyMap) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const onFkey = (e: Event) => {
      const key = (e as CustomEvent<string>).detail
      ref.current[key as keyof FKeyMap]?.()
    }
    window.addEventListener('edim-fkey', onFkey)
    return () => window.removeEventListener('edim-fkey', onFkey)
  }, [])
}
