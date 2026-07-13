'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface CompanyRow {
  companyId?: number; name: string; companyType: string; nation: string
  grade: string; terms: string; remarks?: string; isActive?: boolean
}

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { SUPPLIER: 'info', CUSTOMER: 'ok', PARTNER: 'warn', BANK: 'warn' }

const cols: GridColumn<CompanyRow>[] = [
  { key: 'name', header: '업체명', render: (r) => r.name },
  { key: 'type', header: '유형', width: 78, align: 'center', sortValue: (r) => r.companyType, render: (r) => <Chip tone={TONE[r.companyType] ?? 'info'}>{r.companyType}</Chip> },
  { key: 'nation', header: '국가', width: 44, align: 'center', render: (r) => r.nation || '—' },
  { key: 'grade', header: '평가', width: 44, align: 'center', render: (r) => r.grade || '—' },
  { key: 'terms', header: '결제 조건', render: (r) => r.terms || '—' },
  { key: 'active', header: '상태', width: 58, align: 'center', sortValue: (r) => (r.isActive === false ? 0 : 1), render: (r) => r.isActive === false ? <Chip tone="warn">비활성</Chip> : <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>활성</span> },
]

export function CompanyGrid({ rows }: { rows: CompanyRow[] }) {
  return <DenseGrid prefKey="next-companies" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.companyId ?? r.name} emptyText="거래처가 없습니다" />
}
