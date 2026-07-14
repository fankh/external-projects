/** 공용 편집 이력 (B12) — 화면별 undo/redo 스택 (최대 50).
 *  활성 화면만 전역 신호(CustomEvent 'edim-undo'/'edim-redo' · Ctrl+Z/Y · 툴바 ↶↷)에 반응.
 *  사용: const h = useEditHistory(active, value, setValue) — 편집 직전 h.push() 호출. */
import { useEffect, useRef } from 'react'

const MAX = 50

export interface EditHistory {
  /** 편집 직전 현재 상태 스냅샷 저장 (redo 스택 초기화) */
  push: () => void
  undo: () => boolean
  redo: () => boolean
}

export function useEditHistory<T>(
  active: boolean,
  value: T,
  setValue: (v: T) => void,
  onApply?: (kind: 'undo' | 'redo', v: T) => void,
): EditHistory {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const cur = useRef(value)
  cur.current = value
  const applyRef = useRef(onApply)
  applyRef.current = onApply

  const push = () => {
    past.current.push(structuredClone(cur.current))
    if (past.current.length > MAX) past.current.shift()
    future.current = []
  }

  const undo = (): boolean => {
    const prev = past.current.pop()
    if (prev === undefined) return false
    future.current.push(structuredClone(cur.current))
    setValue(prev)
    applyRef.current?.('undo', prev)
    return true
  }

  const redo = (): boolean => {
    const next = future.current.pop()
    if (next === undefined) return false
    past.current.push(structuredClone(cur.current))
    setValue(next)
    applyRef.current?.('redo', next)
    return true
  }

  const fns = useRef({ push, undo, redo })
  fns.current = { push, undo, redo }

  // 전역 신호 — 활성 화면만 수신. Ctrl+Z/Y 는 입력 필드 포커스 시 브라우저 기본 동작 유지.
  useEffect(() => {
    if (!active) return
    const onUndo = () => { fns.current.undo() }
    const onRedo = () => { fns.current.redo() }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); fns.current.undo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); fns.current.redo() }
    }
    window.addEventListener('edim-undo', onUndo)
    window.addEventListener('edim-redo', onRedo)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('edim-undo', onUndo)
      window.removeEventListener('edim-redo', onRedo)
      window.removeEventListener('keydown', onKey)
    }
  }, [active])

  return fns.current
}
