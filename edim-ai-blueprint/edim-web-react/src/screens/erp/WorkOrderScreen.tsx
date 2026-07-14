/** D3 작업지시 (Work Order) — 설계(도면·BOM·공정)가 제작으로 넘어가는 고리.
 *  발행(ISSUED)→착수(STARTED)→완료(DONE). 완료 시 생산 관리자 알림(부서 후속). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { workOrderService, type WorkOrder } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  ISSUED: 'warn', STARTED: 'info', DONE: 'ok',
}

export function WorkOrderScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<WorkOrder[]>([])
  const [sel, setSel] = useState<string | null>(null)

  const load = useCallback(() => {
    void workOrderService.list().then((r) => { if (r) setRows(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const issue = useCallback(() => {
    const title = window.prompt('작업지시 제목 (예: KDCR 3-13 제작)')?.trim()
    if (!title) return
    const drawingNo = window.prompt('도면번호 (예: KDCR 3-13, 생략 가능)', 'KDCR 3-13')?.trim()
    void workOrderService.create({ title, drawingNo: drawingNo || undefined, projectNo: shell.activeProject?.no })
      .then((wo) => {
        if (wo === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(`작업지시 발행 ✓ — ${wo} ${title} (ISSUED, 설계→제작)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F2: issue }), [load, issue]))

  const transition = (r: WorkOrder, status: string) => {
    void workOrderService.transition(r.woNo, status).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(status === 'DONE'
        ? `완료 처리 ✓ — ${r.woNo} (생산 관리자 알림 — 부서 후속)`
        : `착수 ✓ — ${r.woNo} STARTED`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<WorkOrder>[] = [
    { key: 'no', header: 'WO No', width: 90, code: true, render: (r) => r.woNo },
    { key: 'title', header: t('wo.title', '작업 내용'), render: (r) => r.title },
    { key: 'dwg', header: t('wo.drawing', '도면'), width: 100, render: (r) => r.drawingNo ?? '-' },
    { key: 'proj', header: 'Project', width: 100, render: (r) => r.projectNo ?? '-' },
    {
      key: 'st', header: t('wo.status', '상태'), width: 70, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip>,
    },
    { key: 'iss', header: t('wo.issued', '발행'), width: 92, align: 'center', render: (r) => r.issuedAt },
    {
      key: 'act', header: t('wo.action', '진행'), width: 120, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {r.status === 'ISSUED' ? <Btn style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'STARTED')}>착수</Btn> : null}
          {r.status === 'STARTED' ? <Btn variant="pri" style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'DONE')}>완료</Btn> : null}
          {r.status === 'DONE' ? <Chip tone="ok">완료</Chip> : null}
        </span>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('wo.header', '작업지시')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('wo.hint', '설계 패키지→제작 지시 · 발행→착수→완료 (완료 시 부서 후속 알림) (D3)')}
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={issue}>{t('wo.issueF2', '발행 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('wo.kpiIssued', '발행'), v: rows.filter((r) => r.status === 'ISSUED').length },
            { l: t('wo.kpiStarted', '착수'), v: rows.filter((r) => r.status === 'STARTED').length },
            { l: t('wo.kpiDone', '완료'), v: rows.filter((r) => r.status === 'DONE').length },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--title-navy)' }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('wo.listTitle', '작업지시 목록 — 발행·착수·완료 (erp_work_order)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.woNo}
              selectedKey={sel} onRowClick={(r) => setSel(r.woNo)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('wo.empty', '작업지시 없음 — F2 로 발행 (설계 패키지→제작)')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
