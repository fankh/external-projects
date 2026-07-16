'use client'

/** 작업지시 — 발행 폼 + 행별 착수/완료 전이 (N3 복구). */
import { useActionState, useTransition, useState } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { issueWorkOrder, transitionWorkOrder, type ActState } from './actions'

export interface WoRow {
  woNo: string; title: string; drawingNo: string; projectNo: string
  status: string; assignee: string; issuedAt: string; doneAt: string | null; assemblyNote: string
}

export function WoGrid({ rows }: { rows: WoRow[] }) {
  const { t } = useI18n()
  const [regSt, regAction, regPending] = useActionState(issueWorkOrder, {} as ActState)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const cols: GridColumn<WoRow>[] = [
    { key: 'no', header: t('wo.header', '작업지시'), width: 110, code: true, render: (r) => r.woNo },
    { key: 'title', header: t('wo.titleCol', '제목'), render: (r) => r.title },
    { key: 'dwg', header: t('wo.drawing', '도면'), width: 110, code: true, render: (r) => r.drawingNo || '—' },
    { key: 'proj', header: 'Project', width: 100, render: (r) => r.projectNo || '—' },
    { key: 'status', header: t('wo.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'DONE' ? 'ok' : r.status === 'STARTED' ? 'warn' : 'info'}>{r.status}</Chip> },
    { key: 'assignee', header: t('wo.assignee', '담당'), width: 80, align: 'center', render: (r) => r.assignee || '—' },
    { key: 'issued', header: t('wo.issuedDate', '지시일'), width: 96, align: 'center', render: (r) => r.issuedAt },
    { key: 'act', header: t('wo.transition', '전이'), width: 76, align: 'center', render: (r) => (
      r.status === 'ISSUED'
        ? <button className="b" disabled={pending} style={{ height: 18, fontSize: 10 }}
            onClick={() => start(async () => setSt(await transitionWorkOrder(r.woNo, 'STARTED')))}>{t('wo.start', '착수')}</button>
        : r.status === 'STARTED'
          ? <button className="b run" disabled={pending} style={{ height: 18, fontSize: 10 }}
              onClick={() => start(async () => setSt(await transitionWorkOrder(r.woNo, 'DONE')))}>{t('wo.done', '완료')}</button>
          : '—') },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="title" placeholder={t('wo.titlePh', '작업지시 제목')} style={{ width: 170 }} />
        <input className="in" name="drawingNo" placeholder={t('wo.drawingNoPh', '도면번호')} style={{ width: 110 }} />
        <input className="in" name="projectNo" placeholder={t('wo.projectNoPh', '프로젝트 No')} style={{ width: 100 }} />
        <input className="in" name="assignee" placeholder={t('wo.assigneePh', '담당 ID')} style={{ width: 80 }} />
        <button className="b run" type="submit" disabled={regPending}>{t('wo.issueBtn', '＋ 발행')}</button>
        {(regSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </form>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-wo" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.woNo} emptyText={t('wo.empty', '작업지시가 없습니다')} />
      </div>
    </div>
  )
}
