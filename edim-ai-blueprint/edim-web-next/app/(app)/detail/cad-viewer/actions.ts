'use server'

/** CAD 뷰어 편집 — /cad/view/{id}/edit 위임 (Design Editor 와 동일 백엔드 경로). */
import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import type { CadEditOp } from '@/components/CadSvg'

export async function viewerCadEdit(fileId: number, ops: CadEditOp[]): Promise<{ applied: number; document: CadDocument }> {
  return apiServer<{ applied: number; document: CadDocument }>(`/cad/view/${fileId}/edit`, { method: 'POST', body: JSON.stringify({ ops }) })
}

/** 서버 정본 재조회 (편집 실패 복원용). */
export async function viewerCadView(fileId: number): Promise<CadDocument | null> {
  try {
    const r = await apiServer<{ document: CadDocument }>(`/cad/view/${fileId}`)
    return r.document
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}
