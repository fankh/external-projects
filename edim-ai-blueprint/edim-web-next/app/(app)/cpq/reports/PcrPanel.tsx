'use client'

/** Report Center — PCR 수익성 보고서 그리드 + PDF 발급 (RPT-07, N5 복구). */
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface PcrRow {
  pcrId: number; businessType: string; code: string; directCostTotal: number
  contributionMargin: number | null; ebit: number | null; status: string
}

const won = (n: number | null) => (n == null ? '—' : `₩ ${Math.round(n).toLocaleString()}`)

const cols: GridColumn<PcrRow>[] = [
  { key: 'id', header: 'PCR', width: 52, align: 'right', code: true, sortValue: (r) => r.pcrId, render: (r) => r.pcrId },
  { key: 'type', header: '사업 유형', width: 90, align: 'center', render: (r) => r.businessType },
  { key: 'code', header: '완성품 코드', width: 140, code: true, render: (r) => r.code },
  { key: 'cost', header: '직접원가', width: 110, align: 'right', sortValue: (r) => r.directCostTotal, render: (r) => won(r.directCostTotal) },
  { key: 'margin', header: '기여마진', width: 110, align: 'right', sortValue: (r) => r.contributionMargin ?? 0, render: (r) => won(r.contributionMargin) },
  { key: 'ebit', header: 'EBIT', width: 110, align: 'right', sortValue: (r) => r.ebit ?? 0, render: (r) => won(r.ebit) },
  { key: 'status', header: '상태', width: 70, align: 'center', render: (r) => <Chip tone="info">{r.status}</Chip> },
  { key: 'pdf', header: 'PDF', width: 56, align: 'center', render: (r) => (
    <button className="b" style={{ height: 18, fontSize: 10 }} title="PCR 수익성 보고서 PDF (RPT-07)"
      onClick={() => window.open(`/api/next/bin?kind=pcr&id=${r.pcrId}`, '_blank')}>🖶 PDF</button>) },
]

export function PcrPanel({ rows }: { rows: PcrRow[] }) {
  return (
    <div className="gb" style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>PCR 수익성 보고서 (RPT-07) — {rows.length}건</div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pcr" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.pcrId} emptyText="PCR 이 없습니다 (Run 원가 확정 후 생성)" />
      </div>
    </div>
  )
}
