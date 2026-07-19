'use client'

/** 재사용 모달 다이얼로그 — 오버레이+패널, ESC·배경 클릭 닫기. 등록 폼 공용. */
import { useEffect, type ReactNode } from 'react'

export function Modal({ open, onClose, title, width = 380, children }: {
  open: boolean; onClose: () => void; title: string; width?: number; children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div className="gb" data-modal style={{ width, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', background: '#fff', boxShadow: '0 12px 40px rgba(20,26,40,.4)', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: 12 }}>
          <b style={{ flex: 1 }}>{title}</b>
          <span style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }} onClick={onClose} title="닫기 (Esc)">×</span>
        </div>
        <div style={{ padding: 12 }}>{children}</div>
      </div>
    </div>
  )
}

/** 등록 다이얼로그 열기 버튼 — 트리거 버튼 + Modal 래핑, 성공 시 자동 닫힘.
 *  사용: <RegisterModal trigger="＋ 등록" title="…" ok={state.ok}>{form}</RegisterModal> */
export function RegisterModal({ trigger, title, ok, width, children, onOpenChange }: {
  trigger: string; title: string; ok?: string; width?: number
  children: (close: () => void) => ReactNode; onOpenChange?: (open: boolean) => void
}) {
  return <RegisterModalInner trigger={trigger} title={title} ok={ok} width={width} onOpenChange={onOpenChange}>{children}</RegisterModalInner>
}

import { useState } from 'react'
function RegisterModalInner({ trigger, title, ok, width, children, onOpenChange }: {
  trigger: string; title: string; ok?: string; width?: number
  children: (close: () => void) => ReactNode; onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const set = (v: boolean) => { setOpen(v); onOpenChange?.(v) }
  // 서버액션 성공(ok 변경) 시 자동 닫힘 — 갱신된 그리드가 새 행을 표시
  useEffect(() => { if (ok && open) set(false) }, [ok])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {/* 컬럼 flex(stretch) 하에서도 본문 폭으로 늘어나지 않게 — 내용 크기 고정 */}
      <button className="b run" type="button" onClick={() => set(true)}
        style={{ alignSelf: 'flex-start', width: 'fit-content' }}>{trigger}</button>
      <Modal open={open} onClose={() => set(false)} title={title} width={width}>
        {children(() => set(false))}
      </Modal>
    </>
  )
}
