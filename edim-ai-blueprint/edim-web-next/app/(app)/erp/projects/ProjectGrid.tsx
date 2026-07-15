'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface ProjectRow {
  projectNo: string; projectName: string; projectType: string; stage: string
  clientContact: string; status: string; item: string; registeredAt: string; client: string; dueDate?: string
}

const stageTone = (s: string): 'ok' | 'warn' | 'info' => s === '종료' ? 'info' : s === '계약' ? 'ok' : 'warn'

const cols: GridColumn<ProjectRow>[] = [
  { key: 'projectNo', header: 'No', width: 92, code: true, render: (r) => r.projectNo },
  { key: 'projectName', header: 'Project명', render: (r) => r.projectName },
  { key: 'projectType', header: 'Type', width: 56, align: 'center', render: (r) => r.projectType || '-' },
  { key: 'item', header: 'Item', width: 52, align: 'center', render: (r) => r.item || '-' },
  { key: 'client', header: 'Client', width: 140, render: (r) => r.client || '-' },
  { key: 'stage', header: '영업 단계', width: 76, align: 'center', sortValue: (r) => r.stage, render: (r) => <Chip tone={stageTone(r.stage)}>{r.stage}</Chip> },
  { key: 'dueDate', header: '납기', width: 84, align: 'center', render: (r) => r.dueDate || '-' },
  { key: 'registeredAt', header: '등록일', width: 84, align: 'center', render: (r) => r.registeredAt },
]

export function ProjectGrid({ rows, selectedNo }: { rows: ProjectRow[]; selectedNo?: string | null }) {
  const router = useRouter()
  return <DenseGrid prefKey="next-projects" colFilter columns={cols} rows={rows} rowKey={(r) => r.projectNo}
    selectedKey={selectedNo ?? undefined}
    onRowClick={(r) => router.push(`/erp/projects?no=${encodeURIComponent(r.projectNo)}`)}
    emptyText="프로젝트가 없습니다" />
}
