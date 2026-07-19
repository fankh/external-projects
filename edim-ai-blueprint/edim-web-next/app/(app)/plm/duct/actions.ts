'use server'

/** U8 — Duct 수동 조정 (U2 편집 트랙 통합): 편집 대상화 + 엔티티 편집. */
import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'
import type { CadEditOp } from '@/components/CadSvg'

export async function ductLayoutSave(diffusers: number, floor: string): Promise<{ fileId: number; document: CadDocument } | null> {
  try {
    return await apiServer<{ fileId: number; document: CadDocument }>('/cad/duct-layout/save', {
      method: 'POST', body: JSON.stringify({ diffusers, floor }),
    })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

export async function ductEdit(fileId: number, ops: CadEditOp[]): Promise<{ applied: number; document: CadDocument } | { error: string }> {
  try {
    return await apiServer<{ applied: number; document: CadDocument }>(`/cad/view/${fileId}/edit`, {
      method: 'POST', body: JSON.stringify({ ops }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '편집 실패' }
  }
}
