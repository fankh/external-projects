'use client'

/** 이상 이벤트 — 스캔·에스컬레이션·행별 확인/해소 (N3 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { escalateAnomalies, scanAnomalies, setAnomalyStatus, type ActState } from './actions'

export interface AnomalyRow {
  anomalyId: number; source: string; severity: string; title: string
  refNo: string; status: string; createdAt: string; resolvedAt: string | null
}

const SEV: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { HIGH: 'err', MEDIUM: 'warn', LOW: 'info' }
const ST_TONE: Record<string, 'ok' | 'warn' | 'err'> = { OPEN: 'err', ACK: 'warn', RESOLVED: 'ok' }

export function AnomalyGrid({ rows }: { rows: AnomalyRow[] }) {
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const cols: GridColumn<AnomalyRow>[] = [
    { key: 'sev', header: '심각도', width: 72, align: 'center', sortValue: (r) => r.severity, render: (r) => <Chip tone={SEV[r.severity] ?? 'info'}>{r.severity}</Chip> },
    { key: 'source', header: '출처', width: 90, align: 'center', sortValue: (r) => r.source, render: (r) => r.source },
    { key: 'title', header: '내용', render: (r) => r.title },
    { key: 'ref', header: '참조', width: 110, code: true, render: (r) => r.refNo || '—' },
    { key: 'status', header: '상태', width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={ST_TONE[r.status] ?? 'warn'}>{r.status}</Chip> },
    { key: 'at', header: '발생', width: 110, align: 'center', render: (r) => r.createdAt },
    { key: 'act', header: '전이', width: 76, align: 'center', render: (r) => (
      r.status === 'OPEN'
        ? <button className="b" disabled={pending} style={{ height: 18, fontSize: 10 }}
            onClick={() => start(async () => setSt(await setAnomalyStatus(r.anomalyId, 'ACK')))}>확인</button>
        : r.status === 'ACK'
          ? <button className="b run" disabled={pending} style={{ height: 18, fontSize: 10 }}
              onClick={() => start(async () => setSt(await setAnomalyStatus(r.anomalyId, 'RESOLVED')))}>해소</button>
          : '—') },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="b" disabled={pending} onClick={() => start(async () => setSt(await scanAnomalies()))}>▶ 이상 스캔 (원가·마일스톤)</button>
        <button className="b" disabled={pending} onClick={() => start(async () => setSt(await escalateAnomalies()))}>⚠ 에스컬레이션 (미처리 HIGH)</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-anomaly" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.anomalyId} emptyText="이상 이벤트가 없습니다" />
      </div>
    </div>
  )
}
