'use client'

import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface EcoChange {
  ecoNo: string; title: string; targetType: 'DRAWING' | 'CODE'; targetNo: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'APPLIED'
  revFrom: string; revTo: string; impactCount: number; createdAt: string; reason: string
}

const STATUS_TONE: Record<EcoChange['status'], 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'info', SUBMITTED: 'warn', APPROVED: 'ok', REJECTED: 'err', APPLIED: 'ok',
}

const cols: GridColumn<EcoChange>[] = [
  { key: 'ecoNo', header: 'ECO No', width: 108, code: true, render: (r) => r.ecoNo },
  { key: 'title', header: '제목', render: (r) => r.title },
  { key: 'target', header: '대상', width: 120, render: (r) => `${r.targetType === 'DRAWING' ? '도면' : '코드'} ${r.targetNo}` },
  { key: 'rev', header: 'Rev', width: 78, align: 'center', render: (r) => `${r.revFrom}→${r.revTo}` },
  { key: 'impact', header: '영향', width: 52, align: 'right', sortValue: (r) => r.impactCount, render: (r) => r.impactCount },
  { key: 'status', header: '상태', width: 88, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip> },
  { key: 'createdAt', header: '등록', width: 88, align: 'center', render: (r) => r.createdAt },
]

export function EcoGrid({ rows }: { rows: EcoChange[] }) {
  return <DenseGrid prefKey="next-eco-change" colFilter columns={cols} rows={rows} rowKey={(r) => r.ecoNo} emptyText="변경 요청(ECR)이 없습니다" />
}
