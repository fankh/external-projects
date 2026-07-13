import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import { CadViewer } from './CadViewer'

export const dynamic = 'force-dynamic'

export default async function CadViewerPage({ searchParams }: { searchParams: Promise<{ fileId?: string }> }) {
  const sp = await searchParams
  const fileId = Number(sp.fileId)
  if (!fileId) {
    return <div style={{ padding: 16, fontSize: 11, color: 'var(--txt-mute)' }}>?fileId=&lt;id&gt; 로 도면을 여십시오 (Project Folder 드릴다운)</div>
  }
  let doc: CadDocument | null = null
  let err: string | null = null
  try {
    const r = await apiServer<{ document: CadDocument }>(`/cad/view/${fileId}`)
    doc = r.document
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {err ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
      ) : doc ? (
        <CadViewer doc={doc} fileId={fileId} />
      ) : null}
    </div>
  )
}
