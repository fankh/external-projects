/** F5 — 공용 수정 다이얼로그: 필드 정의 → 값 수집 → onSubmit (성공 null · 오류 메시지 string).
 *  마스터 데이터 수정 동선 표준 (공급처·부품·재질·검증 규칙·창고·단가 마감·문서 메타 등). */
import { useState } from 'react'
import { useEscapeClose } from '../shell/useEscapeClose'
import { Btn, Combo } from './controls'
import { useI18n } from '../i18n/I18nContext'

export interface QField {
  key: string
  label: string
  value: string
  type?: 'text' | 'combo'
  options?: string[]
  readOnly?: boolean
  required?: boolean
  placeholder?: string
}

export function QuickEditDialog(props: {
  title: string
  dataAttr: string
  fields: QField[]
  submitLabel?: string
  /** 컴팩트 1행 폼 — 버튼을 필드 행과 같은 센터라인에 인라인 배치 (짧은 필드 2개 이하). 세로 정렬 표준. */
  compact?: boolean
  onSubmit: (values: Record<string, string>) => Promise<string | null>
  onClose: () => void
}) {
  const { t } = useI18n()
  useEscapeClose(true, props.onClose)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(props.fields.map((f) => [f.key, f.value])))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    const missing = props.fields.find((f) => f.required && !values[f.key]?.trim())
    if (missing) {
      setErr(t('qedit.required', '필수 입력: {n}').replace('{n}', missing.label))
      return
    }
    setBusy(true)
    void props.onSubmit(values).then((e) => {
      if (e !== null) {
        setErr(e)
        setBusy(false)
      }
    }).catch((e: Error) => { setErr(e.message); setBusy(false) })
  }

  const fieldsJsx = props.fields.map((f, i) => (
    <span key={f.key} style={{ display: 'contents' }}>
      <label>{f.label}{f.required ? <i>*</i> : null}</label>
      {f.type === 'combo' ? (
        <Combo value={values[f.key]} options={f.options ?? []}
          onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
      ) : (
        <input className={`in ${f.readOnly ? 'ro' : f.required ? 'req' : ''}`}
          value={values[f.key]} readOnly={f.readOnly} autoFocus={i === 0 && !f.readOnly}
          aria-label={f.label} placeholder={f.placeholder}
          onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
      )}
    </span>
  ))
  const buttons = (
    <>
      <Btn onClick={props.onClose}>{t('price.cancel', '취소')}</Btn>
      <Btn variant="pri" disabled={busy} onClick={submit}>
        {props.submitLabel ?? t('qedit.saveF12', '저장 F12')}
      </Btn>
    </>
  )

  return (
    <div {...{ [`data-${props.dataAttr}`]: true }} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{
        width: props.compact ? 'min(680px, 92vw)' : 380,
        background: '#fff', border: '1px solid var(--line-strong)', boxShadow: '0 8px 30px rgba(20,26,40,.35)',
      }} onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
          <b>{props.title}</b><span className="sp" />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        {props.compact ? (
          // 컴팩트 1행 — 필드와 버튼이 같은 센터라인 (세로 정렬 표준: edim-dialog-alignment)
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
            <div className="frm" style={{ flex: 1, minWidth: 0, padding: 0 }}>{fieldsJsx}</div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>{buttons}</div>
          </div>
        ) : (
          <>
            <div className="frm" style={{ padding: 10 }}>{fieldsJsx}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '0 10px 10px' }}>{buttons}</div>
          </>
        )}
        {err ? <div style={{ color: 'var(--err)', fontSize: 11, padding: '0 10px 8px' }}>{err}</div> : null}
      </div>
    </div>
  )
}
