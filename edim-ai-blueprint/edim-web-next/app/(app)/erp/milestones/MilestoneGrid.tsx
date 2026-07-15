'use client'

/** 마일스톤 그리드 + 등록/완료 액션 (N3 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
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

const cols: GridColumn<Milestone>[] = [
  { key: 'proj', header: '프로젝트', width: 100, code: true, render: (r) => r.projectNo },
  { key: 'stage', header: '단계', width: 80, align: 'center', sortValue: (r) => r.stage, render: (r) => r.stageLabel || r.stage },
  { key: 'planned', header: '계획일', width: 100, align: 'center', render: (r) => r.plannedDate },
  { key: 'actual', header: '실적일', width: 100, align: 'center', render: (r) => r.actualDate || '—' },
  { key: 'delay', header: '상태', width: 72, align: 'center', sortValue: (r) => r.delayStatus, render: (r) => <Chip tone={DTONE[r.delayStatus] ?? 'info'}>{DLABEL[r.delayStatus] ?? r.delayStatus}</Chip> },
  { key: 'wd', header: '영업일 잔여', width: 84, align: 'right', sortValue: (r) => r.workdaysLeft, render: (r) => r.status === 'DONE' ? '—' : r.workdaysLeft },
  { key: 'note', header: '비고', render: (r) => r.note || '—' },
]

export function MilestoneGrid({ rows }: { rows: Milestone[] }) {
  const [regSt, regAction, regPending] = useActionState(addMilestone, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.milestoneId === selId) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="projectNo" placeholder="프로젝트 No" style={{ width: 100 }} />
        <select className="in" name="stage" style={{ width: 76 }}>
          {STAGE_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input className="in req" name="plannedDate" placeholder="계획일 YYYY-MM-DD" style={{ width: 116 }} />
        <input className="in" name="note" placeholder="비고" style={{ width: 130 }} />
        <button className="b run" type="submit" disabled={regPending}>＋ 납기 등록</button>
        <span className="sep" />
        <button className="b" disabled={pending || !sel || sel.status === 'DONE'} onClick={() => {
          if (!sel) return
          start(async () => { setSt(await completeMilestone(sel.milestoneId, new Date().toISOString().slice(0, 10))); setSelId(null) })
        }}>완료 처리{sel && sel.status !== 'DONE' ? ` (${sel.projectNo} ${sel.stageLabel || sel.stage})` : ''}</button>
        {(regSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </form>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-milestones" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.milestoneId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.milestoneId)} emptyText="마일스톤이 없습니다" />
      </div>
    </div>
  )
}
