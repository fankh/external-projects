'use client'

/** ECR 등록 폼 (N2) — 영향 분석 자동 첨부. */
import { useActionState } from 'react'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { createEcr, type EcrState } from './actions'

export function EcrForm() {
  const { t } = useI18n()
  const perm = usePermission()
  const [st, action, pending] = useActionState(createEcr, {} as EcrState)
  return (
    <RegisterModal disabled={!perm.canWrite('plm-eco')} disabledTitle={perm.denyWrite}
          trigger={`＋ ${t('eco.regBtn', 'ECR 등록')}`} title={t('eco.regTitle', 'ECR 등록')} ok={st.ok}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('eco.title', '변경 제목')}</label>
          <input className="in req" name="title" autoFocus />
          <label>{t('eco.targetTypeLabel', '대상 유형')}</label>
          <select className="in" name="targetType" defaultValue="DRAWING">
            <option value="DRAWING">{t('eco.typeDrawing', '도면')}</option><option value="CODE">{t('eco.typeCode', '코드')}</option>
          </select>
          <label>{t('eco.targetNoPh', '대상 번호 (도면/코드)')}</label>
          <input className="in req" name="targetNo" />
          <label>{t('eco.newDrawingPh', '신도면 번호 (대체 시)')}</label>
          <input className="in" name="newDrawingNo" />
          <label>{t('eco.reasonPh', '변경 사유')}</label>
          <input className="in" name="reason" />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}
