'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface ProjectRow {
  projectNo: string; projectName: string; projectType: string; stage: string
  clientContact: string; status: string; item: string; registeredAt: string; client: string; dueDate?: string
}

const stageTone = (s: string): 'ok' | 'warn' | 'info' => s === '종료' ? 'info' : s === '계약' ? 'ok' : 'warn'

export function ProjectGrid({ rows, selectedNo }: { rows: ProjectRow[]; selectedNo?: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  // 영업 단계 값(한국어, 서버 데이터) → 로케일 표시
  const stageLabel: Record<string, string> = {
    '기술 제안': t('stage.proposal', '기술 제안'), '견적': t('kind.quote', '견적'),
    '계약': t('stage.contract', '계약'), '수행': t('stage.execution', '수행'), '종료': t('stage.closed', '종료'),
  }
  const cols: GridColumn<ProjectRow>[] = [
    { key: 'projectNo', header: 'No', width: 92, code: true, render: (r) => r.projectNo },
    { key: 'projectName', header: t('prj.name', 'Project명'), render: (r) => r.projectName },
    { key: 'projectType', header: 'Type', width: 56, align: 'center', render: (r) => r.projectType || '-' },
    { key: 'item', header: 'Item', width: 52, align: 'center', render: (r) => r.item || '-' },
    { key: 'client', header: 'Client', width: 140, render: (r) => r.client || '-' },
    { key: 'stage', header: t('prj.salesStage', '영업 단계'), width: 76, align: 'center', sortValue: (r) => r.stage, render: (r) => <Chip tone={stageTone(r.stage)}>{stageLabel[r.stage] ?? r.stage}</Chip> },
    { key: 'dueDate', header: t('prj.dueDate', '납기'), width: 84, align: 'center', render: (r) => r.dueDate || '-' },
    { key: 'registeredAt', header: t('prj.registeredAt', '등록일'), width: 84, align: 'center', render: (r) => r.registeredAt },
  ]
  return <DenseGrid prefKey="next-projects" colFilter columns={cols} rows={rows} rowKey={(r) => r.projectNo}
    selectedKey={selectedNo ?? undefined}
    onRowClick={(r) => {
      // F1 — 타이틀바 활성 프로젝트 컨텍스트 갱신
      window.dispatchEvent(new CustomEvent('edim-set-project', { detail: { no: r.projectNo, name: r.projectName, stage: r.stage } }))
      router.push(`/erp/projects?no=${encodeURIComponent(r.projectNo)}`)
    }}
    emptyText={t('prj.empty', '프로젝트가 없습니다')} />
}
