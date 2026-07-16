'use client'

/** Run 이력·정리 — Run 삭제·보관 정리·MinIO GC (N5b 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { cleanupRuns, deleteRun, gcStorage, type ActState } from './actions'

export interface RunRow {
  runId: number; status: string; runType: string; startedAt: string
  durationSec: number | null; outputCount: number; createdBy: string
  latest: boolean; referenced: boolean; protected: boolean
}

export function RunGrid({ rows }: { rows: RunRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<RunRow>[] = [
    { key: 'id', header: 'Run', width: 64, align: 'right', code: true, sortValue: (r) => r.runId, render: (r) => r.runId },
    { key: 'status', header: t('run.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'SUCCESS' ? 'ok' : r.status === 'FAILED' ? 'err' : 'info'}>{r.status}</Chip> },
    { key: 'type', header: t('run.type', '유형'), width: 90, align: 'center', sortValue: (r) => r.runType, render: (r) => r.runType },
    { key: 'started', header: t('runs.startedCol', '시작'), width: 130, align: 'center', render: (r) => r.startedAt },
    { key: 'dur', header: t('runs.durCol', '소요(s)'), width: 72, align: 'right', sortValue: (r) => r.durationSec ?? 0, render: (r) => r.durationSec ?? '—' },
    { key: 'out', header: t('run.out', '산출물'), width: 64, align: 'right', sortValue: (r) => r.outputCount, render: (r) => r.outputCount },
    { key: 'by', header: t('runs.byCol', '수행자'), width: 80, align: 'center', render: (r) => r.createdBy },
    { key: 'flag', header: '', width: 90, align: 'center', noSort: true, noFilter: true, render: (r) => <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>{r.latest ? <Chip tone="ok">{t('runs.latest', '최신')}</Chip> : null}{r.referenced ? <Chip tone="info">{t('runs.referenced', '참조')}</Chip> : null}</span> },
  ]
  const [selId, setSelId] = useState<number | null>(null)
  const [keep, setKeep] = useState('10')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.runId === selId) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `${t('runs.selected', '선택 Run')} #${sel.runId}` : t('runs.selectHint', '행 클릭=선택')}</span>
        <button className="b" disabled={pending || !sel || sel.latest || sel.referenced}
          title={sel?.latest || sel?.referenced ? t('runs.protectedHint', '최신/참조 Run 은 보호됩니다') : undefined}
          onClick={() => {
            if (sel && confirm(`Run #${sel.runId} 을 정리하시겠습니까? (산출물 포함)`))
              start(async () => { setSt(await deleteRun(sel.runId)); setSelId(null) })
          }}>{t('runs.cleanupRun', 'Run 정리')}</button>
        <span className="sep" />
        <label>{t('runs.keepLatest', '최신 유지')}</label>
        <input className="in" style={{ width: 44, textAlign: 'right' }} value={keep} onChange={(e) => setKeep(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => {
          if (confirm(`최신 ${keep}건만 유지하고 나머지를 정리하시겠습니까?`))
            start(async () => setSt(await cleanupRuns(Math.max(1, Number(keep) || 10))))
        }}>{t('run.cleanup', '보관 정리')}</button>
        <span className="sep" />
        <button className="b" disabled={pending} onClick={() => start(async () => setSt(await gcStorage(false)))}>{t('runs.gcPreview', 'MinIO GC 미리보기')}</button>
        <button className="b" disabled={pending} onClick={() => {
          if (confirm('고아 오브젝트를 실제로 삭제하시겠습니까?'))
            start(async () => setSt(await gcStorage(true)))
        }}>{t('runs.gcApply', 'GC 적용')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-runs" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.runId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.runId)} emptyText={t('runs.empty', 'Run 이력이 없습니다')} />
      </div>
    </div>
  )
}
