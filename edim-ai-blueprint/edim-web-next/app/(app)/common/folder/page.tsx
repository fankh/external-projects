import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FolderGrid, type FolderFile } from './FolderGrid'

export const dynamic = 'force-dynamic'

export default async function FolderPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams
  const project = (sp.project ?? 'PS-61313-5').trim() || 'PS-61313-5'
  let rows: FolderFile[] = []
  let err: string | null = null
  try {
    rows = await apiServer<FolderFile[]>(`/files?project=${encodeURIComponent(project)}`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`Project Folder — ${project}`} count={err ? undefined : rows.length} source="/files" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <FolderGrid rows={rows} project={project} />}
      </div>
    </div>
  )
}
