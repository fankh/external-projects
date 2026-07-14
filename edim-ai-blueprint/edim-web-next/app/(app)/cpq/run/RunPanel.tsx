'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { startRun, pollRun, type RunResult, type RunStep, type RunOutput, type RunLogEntry } from './actions'
import { CostPanel } from './CostPanel'

const STEP_CHIP: Record<RunStep['status'], { tone: 'ok' | 'warn' | 'info'; label: string } | null> = {
  PENDING: null, RUNNING: { tone: 'info', label: '실행 중' }, DONE: { tone: 'ok', label: '완료' }, WARN: { tone: 'warn', label: 'warn 1' },
}

export function RunPanel({ selectionId }: { selectionId?: number }) {
  const { t } = useI18n()
  const [result, setResult] = useState<RunResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const runningRef = useRef(false)   // 폴링 중복 방지

  const start = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setErr(null); setResult(null)
    try {
      const { runId } = await startRun(selectionId)
      // 완료(SUCCESS/FAILED)까지 폴링
      for (let i = 0; i < 120; i++) {
        const r = await pollRun(runId)
        setResult(r)
        if (r.status !== 'RUNNING') break
        await new Promise((res) => setTimeout(res, 800))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실행 실패')
    } finally {
      runningRef.current = false
    }
  }, [selectionId])

  useEffect(() => { void start() }, [start])

  const stepCols: GridColumn<RunStep>[] = [
    { key: 'no', header: t('run.step', '단계'), width: 30, align: 'center', render: (r) => r.no },
    { key: 'task', header: t('run.task', '작업'), render: (r) => r.task },
    { key: 'measured', header: t('run.measured', '실측'), width: 120, render: (r) => (r.status === 'PENDING' ? '—' : r.measured) },
    { key: 'elapsed', header: t('run.elapsed', '소요'), width: 64, align: 'right', render: (r) => (r.status === 'DONE' || r.status === 'WARN' ? r.elapsed : '') },
    { key: 'status', header: t('run.status', '상태'), width: 62, align: 'center', render: (r) => { const c = STEP_CHIP[r.status]; return c ? <Chip tone={c.tone}>{c.label}</Chip> : null } },
  ]
  const outCols: GridColumn<RunOutput>[] = [
    { key: 'folder', header: t('run.folder', '폴더'), width: 46, align: 'center', render: (r) => r.folder },
    { key: 'file', header: t('run.file', '파일'), render: (r) => r.file },
    { key: 'type', header: t('run.type', '유형'), width: 46, align: 'center', render: (r) => r.fileType },
    { key: 'status', header: t('run.status', '상태'), width: 96, align: 'center', render: (r) => <Chip tone={r.statusTone}>{r.status}</Chip> },
  ]
  const logCols: GridColumn<RunLogEntry>[] = [
    { key: 't', header: t('run.time', '시각'), width: 58, align: 'center', render: (r) => r.time },
    { key: 'm', header: t('run.message', '메시지'), render: (r) => <span style={r.level === 'warn' ? { color: 'var(--warn)' } : undefined}>{r.message}</span> },
  ]

  const pct = Math.round((result?.progress ?? 0) * 100)
  const done = result?.status === 'SUCCESS'
  const busy = runningRef.current || result?.status === 'RUNNING'

  return (
    <div className="fill-col" style={{ padding: 6, gap: 6, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b style={{ color: 'var(--title-navy)' }}>Run #{result?.runId ?? '—'} — AHU 5 (ALL)</b>
        {done ? <Chip tone="ok">SUCCESS</Chip> : result?.status === 'FAILED' ? <Chip tone="warn">FAILED</Chip> : <Chip tone="info">RUNNING</Chip>}
        <div className="pgbar" style={{ flex: 1 }}>
          <div className="fill" style={{ width: `${pct}%` }} />
          <span className="pct">{pct}%</span>
        </div>
        <button className="b" disabled={busy} onClick={() => void start()} style={{ height: 20, fontSize: 11 }}>{t('run.rerunF5', '재실행')}</button>
      </div>
      {err ? <div style={{ padding: 8, fontSize: 11, color: 'var(--err)' }}>실행 오류 — {err}</div> : null}
      <DenseGrid columns={stepCols} rows={result?.steps ?? []} rowKey={(r) => r.no} />
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0 }}>
        <div className="gb" style={{ flex: 1.35, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('run.outputs', '산출물')}</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {done ? <DenseGrid columns={outCols} rows={result?.outputs ?? []} rowKey={(_, i) => i} />
              : <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('run.waitPipeline', '파이프라인 완료 후 표시됩니다…')}</div>}
          </div>
        </div>
        <div className="gb" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('run.execLog', '실행 로그')}</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DenseGrid columns={logCols} rows={result?.logs ?? []} rowKey={(_, i) => i} mono />
          </div>
        </div>
      </div>
      {done && result?.runId ? <CostPanel runId={result.runId} /> : null}
    </div>
  )
}
