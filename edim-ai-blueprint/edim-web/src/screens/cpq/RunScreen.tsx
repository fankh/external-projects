/** EDIM Run (디자인시안 b05) — 단계 그리드 + 진행률 → 산출물·로그 2그리드. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cpqService, fileService } from '../../api/services'
import type { RunLogEntry, RunOutput, RunResult, RunStep } from '../../api/types'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function RunScreen({ active, tab }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell   // 안정 참조 — statusMsg(JSX) 루프 방지
  const { t } = useI18n()
  const [result, setResult] = useState<RunResult | null>(null)

  const STEP_CHIP: Record<RunStep['status'], { tone: 'ok' | 'warn' | 'info'; label: string } | null> = {
    PENDING: null,
    RUNNING: { tone: 'info', label: t('run.running', '실행 중') },
    DONE: { tone: 'ok', label: t('enum.done', '완료') },
    WARN: { tone: 'warn', label: 'warn 1' },
  }
  const cancelRef = useRef<(() => void) | null>(null)

  const start = useCallback(() => {
    cancelRef.current?.()
    const { cancel } = cpqService.startRun(setResult)
    cancelRef.current = cancel
  }, [])

  useEffect(() => {
    start()
    return () => cancelRef.current?.()
  }, [start])

  useEffect(() => {
    if (active && result?.status === 'SUCCESS') {
      setStatusMsg(
        <span style={{ color: 'var(--warn)' }}>warn 1 — 단가 소스 확인 (W-13)</span>,
      )
    }
  }, [active, result?.status, setStatusMsg])

  useFKeys(active, useMemo(() => ({ F5: start, F9: start }), [start]))

  const stepCols: GridColumn<RunStep>[] = [
    { key: 'no', header: t('run.step', '단계'), width: 30, align: 'center', render: (r) => r.no },
    { key: 'task', header: t('run.task', '작업'), render: (r) => r.task },
    {
      key: 'measured', header: t('run.measured', '실측'), width: 120,
      render: (r) => (r.status === 'PENDING' ? '—' : r.measured),
    },
    {
      key: 'elapsed', header: t('run.elapsed', '소요'), width: 64, align: 'right',
      render: (r) => (r.status === 'DONE' || r.status === 'WARN' ? r.elapsed : ''),
    },
    {
      key: 'status', header: t('run.status', '상태'), width: 62, align: 'center',
      render: (r) => {
        const c = STEP_CHIP[r.status]
        return c ? <Chip tone={c.tone}>{c.label}</Chip> : null
      },
    },
  ]

  // 데이터 enum 표시 번역 — 내부 값(비교·상태)은 그대로 유지
  const outStatusLabel = (s: string) =>
    s === '생성' ? t('run.generated', '생성')
      : s === '고객승인 대기' ? t('run.custApprovalWait', '고객승인 대기')
        : s
  const nextActionLabel = (a: string) =>
    a === '미리보기' ? t('common.preview', '미리보기')
      : a === 'AP 요청' ? t('run.apRequest', 'AP 요청')
        : a === 'QCR 발행' ? t('run.qcrIssue', 'QCR 발행')
          : a === '열기' ? t('run.open', '열기')
            : a === 'ERP 전송' ? t('run.erpSend', 'ERP 전송')
              : a

  const outCols: GridColumn<RunOutput>[] = [
    { key: 'folder', header: t('run.folder', '폴더'), width: 40, align: 'center', render: (r) => r.folder },
    { key: 'file', header: t('run.file', '파일'), render: (r) => r.file },
    { key: 'type', header: t('run.type', '유형'), width: 42, align: 'center', render: (r) => r.fileType },
    {
      key: 'status', header: t('run.status', '상태'), width: 92, align: 'center',
      render: (r) => <Chip tone={r.statusTone}>{outStatusLabel(r.status)}</Chip>,
    },
    {
      key: 'action', header: t('run.nextAction', '다음 행동'), width: 116, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {r.nextAction
            ? <span className="b" style={{ height: 18, fontSize: 10 }}
                onClick={(e) => {
                  if (r.nextAction === '미리보기' && r.fileId != null) {
                    e.stopPropagation()
                    shell.openTab({
                      id: `cad-viewer:${r.fileId}`, screenId: 'cad-viewer',
                      code: 'CAD', title: r.file.slice(0, 16),
                      params: { fileId: r.fileId, name: r.file, from: tab.id },
                    })
                  }
                }}>{nextActionLabel(r.nextAction)}</span>
            : null}
          {r.fileId != null ? (
            <span className="b" style={{ height: 18, fontSize: 10 }}
              onClick={(e) => {
                e.stopPropagation()
                void fileService.download(r.fileId!, r.file)
                  .then(() => shell.setStatusMsg(`다운로드 — ${r.file} (MinIO)`))
                  .catch((err: Error) => shell.setStatusMsg(
                    <span style={{ color: 'var(--err)' }}>{err.message}</span>))
              }}>⬇</span>
          ) : null}
        </span>
      ),
    },
  ]

  const logCols: GridColumn<RunLogEntry>[] = [
    { key: 't', header: t('run.time', '시각'), width: 58, align: 'center', render: (r) => r.time },
    {
      key: 'm', header: t('run.message', '메시지'),
      render: (r) => (
        <span style={r.level === 'warn' ? { color: 'var(--warn)' } : undefined}>{r.message}</span>
      ),
    },
  ]

  const pct = Math.round((result?.progress ?? 0) * 100)
  const done = result?.status === 'SUCCESS'

  return (
    <div className="fill-col" style={{ padding: 6, gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b style={{ color: 'var(--title-navy)' }}>Run #{result?.runId ?? '—'} — AHU 5 (ALL)</b>
        {done
          ? <Chip tone="ok">{t('run.successChip', 'SUCCESS 8m 32s · 목표 1h 대비 -86%')}</Chip>
          : <Chip tone="info">RUNNING</Chip>}
        <div className="pgbar" style={{ flex: 1 }}>
          <div className="fill" style={{ width: `${pct}%` }} />
          <span className="pct">{pct}%</span>
        </div>
        <Btn onClick={start}>{t('run.rerunF5', '재실행 F5')}</Btn>
      </div>
      <DenseGrid columns={stepCols} rows={result?.steps ?? []} rowKey={(r) => r.no} />
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0 }}>
        <GroupBox title={t('run.outputsTitle', '산출물 — PS-61313-5 (더블클릭=문서 상세)')} style={{ flex: 1.35 }} noPad
          right={<>
            <span className="b" style={{ height: 18, fontSize: 10 }}>ZIP ⬇</span>
            <span className="b" style={{ height: 18, fontSize: 10 }}>{t('run.openFolder', '폴더 열기')}</span>
          </>}>
          {done
            ? <DenseGrid columns={outCols} rows={result?.outputs ?? []} rowKey={(_, i) => i}
                onRowDoubleClick={(r) => shell.openTab({
                  id: `doc-detail:${r.file}`, screenId: 'doc-detail',
                  code: '문서', title: r.file.slice(0, 14),
                  params: { file: r.file, folder: r.folder, fileType: r.fileType, status: r.status },
                })} />
            : <div style={{ padding: 10, color: 'var(--txt-mute)' }}>{t('run.waitPipeline', '파이프라인 완료 후 표시됩니다…')}</div>}
        </GroupBox>
        <GroupBox title={t('run.execLog', '실행 로그')} style={{ flex: 1 }} noPad
          right={<span className="cb2" style={{ height: 18, fontSize: 10 }}>{t('enum.all', '전체')}</span>}>
          <DenseGrid columns={logCols} rows={result?.logs ?? []} rowKey={(_, i) => i} mono />
        </GroupBox>
      </div>
    </div>
  )
}
