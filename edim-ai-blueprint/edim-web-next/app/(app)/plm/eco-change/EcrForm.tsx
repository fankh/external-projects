'use client'

/** ECR 등록 폼 (N2) — 영향 분석 자동 첨부. */
import { useActionState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { createEcr, type EcrState } from './actions'

export function EcrForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createEcr, {} as EcrState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="title" placeholder={t('eco.title', '변경 제목')} style={{ width: 180 }} />
      <select className="in" name="targetType" defaultValue="DRAWING" style={{ width: 86 }}>
        <option value="DRAWING">{t('eco.typeDrawing', '도면')}</option><option value="CODE">{t('eco.typeCode', '코드')}</option>
      </select>
      <input className="in req" name="targetNo" placeholder={t('eco.targetNoPh', '대상 번호 (도면/코드)')} style={{ width: 140 }} />
      <input className="in" name="newDrawingNo" placeholder={t('eco.newDrawingPh', '신도면 번호 (대체 시)')} style={{ width: 140 }} />
      <input className="in" name="reason" placeholder={t('eco.reasonPh', '변경 사유')} style={{ width: 170 }} />
      <button className="b run" type="submit" disabled={pending}>＋ {t('eco.regBtn', 'ECR 등록')}</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}
