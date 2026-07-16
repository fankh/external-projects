'use client'

import { useActionState, useEffect, useRef } from 'react'
import { usePermission } from '@/components/PermissionProvider'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { addHoliday, type FormState } from './actions'

/** 공휴일 등록 폼 — 서버 액션(addHoliday) + useActionState. 성공 시 revalidate 로 그리드 자동 갱신. */
export function HolidayForm() {
  const { t } = useI18n()
  const { canWrite, denyWrite } = usePermission()
  const writable = canWrite('calendar')
  const [state, action, pending] = useActionState<FormState, FormData>(addHoliday, {})
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) formRef.current?.reset() }, [state.ok])

  return (
    <RegisterModal trigger={t('cal.register', '＋ 등록')} title={t('cal.regTitle', '공휴일 등록')} ok={state.ok}>
      {() => (
        <form ref={formRef} action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('cal.date', '날짜')}</label>
          <input name="date" type="date" className="in" required disabled={!writable} autoFocus />
          <label>{t('cal.name', '공휴일명')}</label>
          <input name="name" className="in" placeholder={t('cal.namePh', '예: 광복절')} required disabled={!writable} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {!writable ? <span style={{ color: 'var(--txt-mute)', fontSize: 10.5, marginRight: 'auto' }}>🔒 {denyWrite}</span> : null}
            {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5, marginRight: 'auto' }}>{state.error}</span> : null}
            <button type="submit" className="b pri" disabled={pending || !writable} title={writable ? '' : denyWrite}>
              {pending ? t('cal.registering', '등록 중…') : t('cal.register', '＋ 등록')}
            </button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}
