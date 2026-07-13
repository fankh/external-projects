import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import { DuctCanvas } from './DuctCanvas'

export const dynamic = 'force-dynamic'

export default async function DuctPage({ searchParams }: { searchParams: Promise<{ diffusers?: string }> }) {
  const sp = await searchParams
  const diffusers = Math.max(1, Math.min(12, Number(sp.diffusers) || 3))
  let doc: CadDocument | null = null
  let err: string | null = null
  try {
    const r = await apiServer<{ document: CadDocument }>(`/cad/duct-layout?diffusers=${diffusers}&floor=3F`)
    doc = r.document
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {err ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
      ) : doc ? (
        <DuctCanvas doc={doc} diffusers={diffusers} />
      ) : null}
    </div>
  )
}
