/** 공용 확인 다이얼로그 — 파괴적/일괄 작업 전 확인 (그리드 다중 선택 일괄 삭제·상태 변경 등).
 *  onConfirm 은 성공 시 null, 오류 시 메시지 string 반환 (인라인 표시). */
import { useState } from 'react'
import { useEscapeClose } from '../shell/useEscapeClose'
import { Btn } from './controls'
import { useI18n } from '../i18n/I18nContext'

export function ConfirmDialog(props: {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  dataAttr?: string
  onConfirm: () => Promise<string | null>
  onClose: () => void
}) {
  const { t } = useI18n()
  useEscapeClose(true, props.onClose)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = () => {
    setBusy(true)
    void props.onConfirm().then((e) => {
      if (e !== null) { setErr(e); setBusy(false); return }
      // 성공 시 호출부가 onClose 처리 — 여기선 상태만 정리
    }).catch((e: Error) => { setErr(e.message); setBusy(false) })
  }

  return (
    <div {...(props.dataAttr ? { [`data-${props.dataAttr}`]: true } : {})} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{ width: 360, background: '#fff', border: '1px solid var(--line-strong)', boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
          <b>{props.title}</b><span className="sp" />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        <div style={{ padding: 12, fontSize: 11.5, lineHeight: 1.7 }}>{props.message}</div>
        {err ? <div style={{ color: 'var(--err)', fontSize: 11, padding: '0 12px 6px' }}>{err}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '0 12px 12px' }}>
          <Btn onClick={props.onClose}>{t('price.cancel', '취소')}</Btn>
          <Btn variant="pri" disabled={busy} onClick={confirm}
            style={props.danger ? { background: 'var(--err)', borderColor: 'var(--err)' } : undefined}>
            {props.confirmLabel ?? t('confirm.ok', '확인')}
          </Btn>
        </div>
      </div>
    </div>
  )
}
