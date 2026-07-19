'use client'

/** 업무함 — 행 선택 + 완료 처리 아일랜드 (N1 복구). 상세는 이벤트 상세(E-4)로 드릴다운. */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { completeEvent, type EventActionState } from './actions'

export interface TaskRow {
  eventId: number; code: string; procName: string; project: string
  owner: string; deadline: string; delayed: boolean; status: string
}

const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { DONE: 'ok', '지연': 'err', '진행': 'info', TODO: 'warn' }

export function TaskGrid({ rows }: { rows: TaskRow[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [selId, setSelId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [st, setSt] = useState<EventActionState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.eventId === selId) ?? null
  // 상태 값(서버 데이터, 일부 한국어) → 로케일 표시
  const statusLabel: Record<string, string> = {
    '지연': t('enum.delayed', '지연'), '진행': t('enum.inProgress', '진행'),
  }

  const cols: GridColumn<TaskRow>[] = [
    { key: 'code', header: t('task.processCol', '공정'), width: 64, align: 'center', code: true, render: (r) => r.code },
    { key: 'proc', header: t('task.taskCol', '업무'), render: (r) => r.procName },
    { key: 'proj', header: 'Project', width: 110, render: (r) => r.project },
    { key: 'owner', header: t('taskbox.owner', '담당'), width: 80, align: 'center', render: (r) => r.owner },
    { key: 'deadline', header: t('taskbox.deadline', '기한'), width: 72, align: 'center', render: (r) => r.deadline },
    { key: 'status', header: t('appr.status', '상태'), width: 72, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.delayed ? 'err' : (TONE[r.status] ?? 'info')}>{statusLabel[r.status] ?? r.status}</Chip> },
  ]

  const complete = () => {
    if (!sel) { setSt({ error: t('task.selectFirst', '완료 처리할 업무를 선택하십시오') }); return }
    if (sel.status === 'DONE') { setSt({ error: t('task.alreadyDone', '이미 완료된 업무입니다') }); return }
    start(async () => {
      const r = await completeEvent(sel.eventId, comment)
      setSt(r)
      if (r.ok) { setSelId(null); setComment('') }
    })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
          {sel ? <>{t('task.selected', '선택')} <b>{sel.procName}</b> (#{sel.eventId})</> : t('task.selectHint', '행 클릭=선택 · 더블클릭=이벤트 상세')}
        </span>
        <input className="in" style={{ width: 220 }} placeholder={t('task.commentPh', '처리 의견 (선택)')}
          value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="b run" disabled={pending || !sel} onClick={complete}>{t('task.complete', '완료 처리')}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-tasks" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.eventId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.eventId)}
          onRowDoubleClick={(r) => router.push(`/detail/event?eventId=${r.eventId}`)}
          emptyText={t('task.empty', '업무가 없습니다')} />
      </div>
    </div>
  )
}
