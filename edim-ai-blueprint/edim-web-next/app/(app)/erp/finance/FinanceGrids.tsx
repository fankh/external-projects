'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { GroupBox } from '@/components/controls'

export interface FxRow { fxId: number; currency: string; rate: number; validFrom: string }
export interface TaxRow { taxId: number; code: string; name: string; ratePct: number }

const fxCols: GridColumn<FxRow>[] = [
  { key: 'cur', header: '통화', width: 70, align: 'center', code: true, render: (r) => r.currency },
  { key: 'rate', header: '환율 (KRW)', width: 120, align: 'right', sortValue: (r) => r.rate, render: (r) => r.rate.toLocaleString() },
  { key: 'from', header: '적용 시작', width: 110, align: 'center', render: (r) => r.validFrom },
]
const taxCols: GridColumn<TaxRow>[] = [
  { key: 'code', header: '코드', width: 90, align: 'center', code: true, render: (r) => r.code },
  { key: 'name', header: '세금명', render: (r) => r.name },
  { key: 'rate', header: '세율 (%)', width: 90, align: 'right', sortValue: (r) => r.ratePct, render: (r) => `${r.ratePct}%` },
]

export function FinanceGrids({ fx, tax }: { fx: FxRow[]; tax: TaxRow[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, height: '100%' }}>
      <GroupBox title={`환율 마스터 — ${fx.length}건`} noPad style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-fx" columns={fxCols} rows={fx} rowKey={(r) => r.fxId} emptyText="환율이 없습니다" />
      </GroupBox>
      <GroupBox title={`세금 코드 — ${tax.length}건`} noPad style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-tax" columns={taxCols} rows={tax} rowKey={(r) => r.taxId} emptyText="세금 코드가 없습니다" />
      </GroupBox>
    </div>
  )
}
