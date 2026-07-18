'use client'

/** U9 QR 정보 열람 (APP-001, 슬라이드 77) — 딥링크 QR 표시.
 *  현장(컴퓨터 접근 불가)에서 스캔 → 모바일 브라우저로 해당 화면 진입. */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Modal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'

export function QrBadge({ path, label }: { path: string; label: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

  useEffect(() => {
    if (!open || !canvasRef.current) return
    void QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 2 })
  }, [open, url])

  return (
    <>
      <button className="b" data-qr-badge style={{ height: 20, fontSize: 10 }}
        title={t('qr.hint', '현장 스캔용 QR — 모바일로 이 화면 열람')} onClick={() => setOpen(true)}>
        ▣ QR
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`QR — ${label}`} width={280}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 11 }}>
          <canvas ref={canvasRef} data-qr-canvas />
          <div className="code" style={{ fontSize: 9.5, wordBreak: 'break-all', textAlign: 'center', color: 'var(--txt-mute)' }}>{url}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('qr.scanHint', '모바일 카메라로 스캔하면 이 화면으로 이동합니다 (로그인 필요)')}</div>
        </div>
      </Modal>
    </>
  )
}
