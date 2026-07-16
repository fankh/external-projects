'use client'

import { useActionState } from 'react'
import { usePermission } from '@/components/PermissionProvider'
import { useI18n } from '@/components/I18nProvider'
import { RegisterModal } from '@/components/Modal'
import { addCompany, importCompaniesExcel, type FormState } from './actions'

export function CompanyForm() {
  const { t } = useI18n()
  const { canWrite, denyWrite } = usePermission()
  const writable = canWrite('company_master')
  const [state, action, pending] = useActionState<FormState, FormData>(addCompany, {})
  const [impSt, impAction, impPending] = useActionState<FormState, FormData>(importCompaniesExcel, {})

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      {writable ? (
        <RegisterModal trigger={t('company.registerBtn', '＋ 거래처 등록')} title={t('company.regTitle', '거래처 등록')} ok={state.ok}>
          {() => (
            <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('company.name', '업체명')}</label>
              <input name="name" className="in req" autoFocus required />
              <label>{t('company.type', '유형')}</label>
              <select name="companyType" className="in" defaultValue="SUPPLIER">
                {['SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK'].map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
              <label>{t('company.nation', '국가')}</label>
              <input name="nation" className="in" defaultValue="KR" />
              <label>{t('company.grade', '평가등급')}</label>
              <input name="grade" className="in" placeholder="A/B/C" />
              <label>{t('company.terms', '결제조건')}</label>
              <input name="terms" className="in" placeholder={t('company.termsPh', '예: 월말 현금')} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center', marginTop: 4 }}>
                {state.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{state.error}</span> : null}
                <button type="submit" className="b run" disabled={pending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
      ) : <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>🔒 {denyWrite}</span>}
      {writable ? (
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="file" name="uploadedFile" accept=".xlsx" className="in" style={{ width: 190, fontSize: 10 }} />
          <button type="submit" className="b" disabled={impPending}>{t('company.importBtn', '⬆ 대량등록')}</button>
        </form>
      ) : null}
      {impSt.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{impSt.error}</span> : null}
      {(state.ok || impSt.ok) ? <span style={{ color: 'var(--run)', fontSize: 10.5 }}>✓ {state.ok || impSt.ok}</span> : null}
    </div>
  )
}
