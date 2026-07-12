/** E3 Run 산출물 누적 관리 — cpq_run 이력 + 산출물 드릴다운 + 보관 정책 정리.
 *  견적(PCR) 참조·최신 SUCCESS Run 은 보호(정리 불가). Folder 58건 누적 문제 해소. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { runService, type RunOutput, type RunRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info'> = {
  SUCCESS: 'ok', RUNNING: 'info', FAILED: 'err',
}

export function RunHistoryScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const perm = usePermission()
  const canWrite = perm.canWrite('cpq-selection')
  const [rows, setRows] = useState<RunRow[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [outputs, setOutputs] = useState<RunOutput[]>([])

  const load = useCallback(() => {
    void runService.list().then((r) => { if (r) setRows(r) })
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (sel == null) { setOutputs([]); return }
    void runService.outputs(sel).then((o) => setOutputs(o ?? []))
  }, [sel])

  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const remove = (r: RunRow) => {
    if (r.protected) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
        {r.latest ? '최신 SUCCESS Run — 정리 불가 (현재 원가 기준)' : '견적(PCR) 참조 중 — 정리 불가'}
      </span>)
      return
    }
    if (!window.confirm(`Run #${r.runId} 정리 — 산출물 ${r.outputCount}건 삭제. 계속?`)) return
    void runService.remove(r.runId).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      if (sel === r.runId) setSel(null)
      load()
      shell.setStatusMsg(`Run #${r.runId} 정리 ✓ (cst_calc·cpq_output 동반 정리)`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cleanup = () => {
    const n = Number((window.prompt('최근 몇 건을 유지하시겠습니까? (그 외 미참조 Run 일괄 정리)', '5') || '').replace(/[^\d]/g, ''))
    if (!n) return
    void runService.cleanup(n).then((r) => {
      if (!r) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(`보관 정리 ✓ — ${r.deleted}건 정리${r.skipped ? `, ${r.skipped}건 보호(참조/최신)` : ''} (최근 ${n}건 유지)`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<RunRow>[] = [
    { key: 'id', header: 'Run', width: 56, align: 'right', code: true, render: (r) => `#${r.runId}` },
    { key: 'type', header: t('run.type', '유형'), width: 64, align: 'center', render: (r) => r.runType },
    {
      key: 'st', header: t('run.status', '상태'), width: 78, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip>,
    },
    { key: 'at', header: t('run.at', '실행'), width: 96, align: 'center', render: (r) => r.startedAt },
    { key: 'dur', header: t('run.dur', '소요'), width: 60, align: 'right', render: (r) => (r.durationSec != null ? `${r.durationSec}s` : '-') },
    { key: 'out', header: t('run.out', '산출물'), width: 56, align: 'right', render: (r) => `${r.outputCount}` },
    {
      key: 'flag', header: t('run.flag', '보호'), width: 84, align: 'center',
      render: (r) => (r.latest ? <Chip tone="ok">최신</Chip>
        : r.referenced ? <Chip tone="warn">참조</Chip>
          : <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>—</span>),
    },
    {
      key: 'act', header: t('run.action', '정리'), width: 56, align: 'center', noSort: true,
      render: (r) => (canWrite && !r.protected
        ? <Btn style={{ height: 18, fontSize: 10, borderColor: 'var(--err)', color: 'var(--err)' }}
          onClick={() => remove(r)}>정리</Btn>
        : <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>보호</span>),
    },
  ]

  const ocols: GridColumn<RunOutput>[] = [
    { key: 'ty', header: t('run.otype', '유형'), width: 90, render: (r) => r.outputType },
    { key: 'f', header: t('run.file', '파일'), render: (r) => r.file },
    { key: 'ft', header: t('run.ft', '형식'), width: 60, align: 'center', render: (r) => r.fileType },
    { key: 'c', header: t('run.at', '생성'), width: 96, align: 'center', render: (r) => r.createdAt },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('run.header', 'Run 이력')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('run.hint', 'cpq_run 이력·산출물 드릴다운 · 보관 정책 정리(참조/최신 보호) (E3)')}
        </span>
        <span style={{ flex: 1 }} />
        <Btn disabled={!canWrite} onClick={cleanup}>{t('run.cleanup', '보관 정리')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('run.kpiTotal', '총 Run'), v: rows.length, c: 'var(--title-navy)' },
            { l: t('run.kpiOut', '총 산출물'), v: rows.reduce((s, r) => s + r.outputCount, 0), c: 'var(--ok)' },
            { l: t('run.kpiProtected', '보호(참조/최신)'), v: rows.filter((r) => r.protected).length, c: 'var(--warn)' },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('run.listTitle', 'Run 이력 — 전체 (cpq_run)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.runId}
              selectedKey={sel} onRowClick={(r) => setSel(r.runId)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('run.empty', 'Run 이력 없음 — EDIM Run 실행 후 누적')}
            </div>
          )}
        </GroupBox>
        {sel != null ? (
          <GroupBox title={t('run.outTitle', 'Run #{n} 산출물').replace('{n}', String(sel))} noPad>
            {outputs.length ? (
              <DenseGrid columns={ocols} rows={outputs} rowKey={(r, i) => `${r.outputType}-${i}`} />
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('run.noOut', '산출물 없음')}
              </div>
            )}
          </GroupBox>
        ) : null}
      </div>
    </div>
  )
}
