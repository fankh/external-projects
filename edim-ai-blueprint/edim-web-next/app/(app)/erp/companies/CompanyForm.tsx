'use client'

import { useActionState, useEffect, useRef } from 'react'
import { usePermission } from '@/components/PermissionProvider'
import { useI18n } from '@/components/I18nProvider'
import { addCompany, type FormState } from './actions'

export function CompanyForm() {
  const { t } = useI18n()
  const { canWrite, denyWrite } = usePermission()
  const writable = canWrite('company_master')
  const [state, action, pending] = useActionState<FormState, FormData>(addCompany, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
      <label style={{ fontSize: 11 }}>{t('company.name', '업체명')}</label>
      <input name="name" className="in" style={{ height: 22, fontSize: 11, width: 160 }} required disabled={!writable} />
      <label style={{ fontSize: 11 }}>{t('company.type', '유형')}</label>
      <select name="companyType" className="in" defaultValue="SUPPLIER" style={{ height: 22, fontSize: 11 }} disabled={!writable}>
        {['SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK'].map((ty) => <option key={ty} value={ty}>{ty}</option>)}
      </select>
      <label style={{ fontSize: 11 }}>{t('company.nation', '국가')}</label>
      <input name="nation" className="in" defaultValue="KR" style={{ height: 22, fontSize: 11, width: 56 }} disabled={!writable} />
      <button type="submit" className="b pri" disabled={pending || !writable} title={writable ? '' : denyWrite} style={{ height: 22, fontSize: 11 }}>
        {pending ? t('company.registering', '등록 중…') : t('company.registerBtn', '＋ 등록')}
      </button>
      {!writable ? <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>🔒 {denyWrite}</span> : null}
      {state.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{state.error}</span> : null}
      {state.ok ? <span style={{ color: 'var(--ok)', fontSize: 10.5 }}>✓ {state.ok}</span> : null}
    </form>
  )
}
