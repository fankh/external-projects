import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import { ArrangementCanvas } from './ArrangementCanvas'

export const dynamic = 'force-dynamic'

export default async function ArrangementPage() {
  let doc: CadDocument | null = null
  let err: string | null = null
  try {
    const r = await apiServer<{ document: CadDocument }>('/cad/arrangement')
    doc = r.document
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {err ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
      ) : doc ? (
        <ArrangementCanvas doc={doc} />
      ) : null}
    </div>
  )
}
