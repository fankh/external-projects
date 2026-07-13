import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ProjectGrid, type ProjectRow } from './ProjectGrid'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  let rows: ProjectRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<ProjectRow[]>('/projects')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="프로젝트 대장 (F-1)" count={err ? undefined : rows.length} source="/projects" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <ProjectGrid rows={rows} />}
      </div>
    </div>
  )
}
