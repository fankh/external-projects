'use client'

/** 마일스톤 그리드 + 등록/완료 액션 (N3 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { addMilestone, completeMilestone, type ActState } from './actions'

export interface Milestone {
  milestoneId: number; projectNo: string; stage: string; stageLabel: string
  plannedDate: string; actualDate: string | null; status: 'PENDING' | 'DONE'
  note: string; delayStatus: 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'PENDING'
  daysLeft: number; workdaysLeft: number
}

const DTONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { DONE: 'ok', OVERDUE: 'err', DUE_SOON: 'warn', PENDING: 'info' }
const DLABEL: Record<string, string> = { DONE: '완료', OVERDUE: '지연', DUE_SOON: '임박', PENDING: '대기' }
const STAGE_OPTS = [
  { value: 'ORDER', label: '수주' }, { value: 'DESIGN', label: '설계' },
  { value: 'PURCHASE', label: '구매' }, { value: 'PRODUCTION', label: '제작' },
  { value: 'SHIPMENT', label: '출하' },
]

export function MilestoneGrid({ rows }: { rows: Milestone[] }) {
  const { t } = useI18n()
  const perm = usePermission()
  const cols: GridColumn<Milestone>[] = [
    { key: 'proj', header: t('ms.project', '프로젝트'), width: 100, code: true, render: (r) => r.projectNo },
    { key: 'stage', header: t('ms.stage', '단계'), width: 80, align: 'center', sortValue: (r) => r.stage, render: (r) => r.stageLabel || r.stage },
    { key: 'planned', header: t('ms.plannedCol', '계획일'), width: 100, align: 'center', render: (r) => r.plannedDate },
    { key: 'actual', header: t('ms.actualCol', '실적일'), width: 100, align: 'center', render: (r) => r.actualDate || '—' },
    { key: 'delay', header: t('ms.delay', '상태'), width: 72, align: 'center', sortValue: (r) => r.delayStatus, render: (r) => <Chip tone={DTONE[r.delayStatus] ?? 'info'}>{t('ms.d' + r.delayStatus, DLABEL[r.delayStatus] ?? r.delayStatus)}</Chip> },
    { key: 'wd', header: t('ms.workdaysLeft', '영업일 잔여'), width: 84, align: 'right', sortValue: (r) => r.workdaysLeft, render: (r) => r.status === 'DONE' ? '—' : r.workdaysLeft },
    { key: 'note', header: t('ms.note', '비고'), render: (r) => r.note || '—' },
  ]
  const [regSt, regAction, regPending] = useActionState(addMilestone, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.milestoneId === selId) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal disabled={!perm.canWrite('erp-milestone')} disabledTitle={perm.denyWrite}
          trigger={t('ms.addBtn', '＋ 납기 등록')} title={t('ms.regTitle', '납기 등록')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('ms.project', '프로젝트')}</label>
              <input className="in req" name="projectNo" placeholder={t('ms.projectPh', '프로젝트 No')} autoFocus />
              <label>{t('ms.stage', '단계')}</label>
              <select className="in" name="stage">
                {STAGE_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <label>{t('ms.plannedCol', '계획일')}</label>
              <input className="in req" name="plannedDate" placeholder={t('ms.plannedPh', '계획일 YYYY-MM-DD')} />
              <label>{t('ms.note', '비고')}</label>
              <input className="in" name="note" />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
        <span className="sep" />
        <button className="b" disabled={pending || !sel || sel.status === 'DONE'} onClick={() => {
          if (!sel) return
          start(async () => { setSt(await completeMilestone(sel.milestoneId, new Date().toISOString().slice(0, 10))); setSelId(null) })
        }}>{t('ms.complete', '완료 처리')}{sel && sel.status !== 'DONE' ? ` (${sel.projectNo} ${sel.stageLabel || sel.stage})` : ''}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-milestones" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.milestoneId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.milestoneId)} emptyText={t('ms.emptyList', '마일스톤이 없습니다')} />
      </div>
    </div>
  )
}
