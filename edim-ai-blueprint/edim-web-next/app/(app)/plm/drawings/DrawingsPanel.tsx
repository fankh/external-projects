'use client'

/** 도면 대장 액션 패널 (N2) — 등록 폼 + 선택 도면의 Rev-up·단계 승인·Supersedure. */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { addSupersedure, createDrawing, decideStep, revUp, type ActState } from './actions'

export interface RevisionRow { rev: string; reason: string; date: string; by: string }
export interface StepRow { approvalId: number; step: string; result: string | null; comment: string | null; date: string | null; by: string | null }

export function DrawingRegForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createDrawing, {} as ActState)
  return (
    <RegisterModal trigger={t('dwg.registerBtn', '＋ 도면 등록')} title={t('dwg.regTitle', '도면 등록')} ok={st.ok}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('dwg.drawingNo', '도면번호 (KDCR …)')}</label>
          <input className="in req" name="drawingNo" autoFocus />
          <label>{t('dwg.drawingName', '도면명')}</label>
          <input className="in req" name="name" />
          <label>{t('dwg.drawingTypeLabel', '도면 유형')}</label>
          <select className="in" name="drawingType" defaultValue="PART">
            <option value="PART">PART</option><option value="ASSEMBLY">ASSEMBLY</option><option value="LAYOUT">LAYOUT</option>
          </select>
          <label>{t('dwg.kindLabel', '구분')}</label>
          <select className="in" name="kind" defaultValue="APPROVAL">
            <option value="APPROVAL">{t('dwg.kindApproval', 'APPROVAL(승인용)')}</option>
            <option value="MANUFACTURING">{t('dwg.kindManufacturing', 'MANUFACTURING(제작용)')}</option>
            <option value="STANDARD">{t('dwg.kindStandard', 'STANDARD(표준)')}</option>
          </select>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}

const STEPS = ['WRITE', 'REVIEW', 'APPROVE']

export function DrawingDetail({ no, revisions, steps }: { no: string; revisions: RevisionRow[]; steps: StepRow[] }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [supNew, setSupNew] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const decided = new Map(steps.filter((s) => s.result).map((s) => [s.step, s]))
  const nextStep = STEPS.find((s) => !decided.get(s) || decided.get(s)?.result === 'REJECTED')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('dwg.detailPrefix', '도면')} {no}</div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dwg.tabRev', 'Rev 이력')} — {revisions.length}건</div>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>Rev</th><th>{t('dwg.reasonCol', '사유')}</th><th>{t('dwg.dateCol', '일자')}</th><th>{t('dwg.byCol', '작성')}</th></tr></thead>
          <tbody>{revisions.map((r) => (
            <tr key={r.rev}><td className="c code">{r.rev}</td><td>{r.reason || '—'}</td><td className="c">{r.date}</td><td className="c">{r.by}</td></tr>
          ))}</tbody>
        </table>
        <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder={t('dwg.revReasonPh', 'Rev 사유')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="b" disabled={pending} onClick={() => start(async () => {
            const r = await revUp(no, reason); setSt(r); if (r.ok) setReason('')
          })}>{t('dwg.revUp', 'Rev 올리기')}</button>
        </div>
      </div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dwg.tabApproval', '단계 승인')} (WRITE→REVIEW→APPROVE)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {STEPS.map((s) => {
            const d = decided.get(s)
            return <Chip key={s} tone={d?.result === 'APPROVED' ? 'ok' : d?.result === 'REJECTED' ? 'err' : s === nextStep ? 'warn' : 'info'}>
              {s}{d?.result ? ` ${d.result === 'APPROVED' ? '✓' : '✗'}` : s === nextStep ? ` (${t('dwg.pendingChip', '대기')})` : ''}
            </Chip>
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder={t('dwg.stepCommentPh', '결재 코멘트 (반려 필수)')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="b run" disabled={pending || !nextStep} onClick={() => start(async () => {
            const r = await decideStep(no, nextStep!, true, comment); setSt(r); if (r.ok) setComment('')
          })}>{nextStep ?? t('dwg.done', '완료')} {t('dwg.approveBtn', '승인')}</button>
          <button className="b" disabled={pending || !nextStep} onClick={() => start(async () => {
            const r = await decideStep(no, nextStep!, false, comment); setSt(r); if (r.ok) setComment('')
          })}>{t('dwg.rejectBtn', '반려')}</button>
        </div>
      </div>

      <div className="gb" style={{ padding: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dwg.supPanelTitle', 'Supersedure — 이 도면을 신도면으로 대체')}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} placeholder={t('dwg.newNo', '신도면 번호')} value={supNew} onChange={(e) => setSupNew(e.target.value)} />
          <button className="b" disabled={pending} onClick={() => start(async () => {
            const r = await addSupersedure(no, supNew, '대체 등록'); setSt(r); if (r.ok) setSupNew('')
          })}>{t('dwg.supRegister', '대체 등록')}</button>
        </div>
      </div>

      {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
    </div>
  )
}
