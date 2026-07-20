'use server'

import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument } from '@/lib/cadTypes'

export interface BomItem { level: number; mainCode: string; resolvedCode: string; name: string; quantity: number; priceK: number | null; path: string }
export interface ExpandResult { finishedGoodsCode: string; items: BomItem[] }
export interface SelectionRow { selectionId: number; finishedGoodsCode: string; slotValues: Record<string, string>; status: string; createdAt: string; xCodeStatus: string | null }

/** 제품 코드 재귀 전개 + slot_map (실 DB). */
export async function expand(slotValues: Record<string, string>): Promise<{ result?: ExpandResult; error?: string }> {
  try {
    return { result: await apiServer<ExpandResult>('/codes/products/expand', { method: 'POST', body: JSON.stringify({ rootCode: 'KDCR 3-13', slotValues }) }) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'BOM 전개 실패' }
  }
}

/** 견적안 저장 (cpq_selection · Run 대상). */
export async function saveSelection(projectNo: string, finishedGoodsCode: string, slotValues: Record<string, string>): Promise<{ selectionId?: number; error?: string }> {
  try {
    const r = await apiServer<{ selectionId: number }>('/cpq/selections', { method: 'POST', body: JSON.stringify({ projectNo, rootCode: 'KDCR 3-13', finishedGoodsCode, slotValues }) })
    return { selectionId: r.selectionId }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}

/** 견적안 삭제 — Run 참조 시 409 보호. */
export async function deleteSelection(selectionId: number): Promise<{ ok?: true; error?: string }> {
  const { revalidatePath } = await import('next/cache')
  try {
    await apiServer(`/cpq/selections/${selectionId}`, { method: 'DELETE' })
    revalidatePath('/cpq/selection')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '견적안 삭제 실패' }
  }
}

/** Arrangement 구성 블록 (트리아지 #37) — 선택한 Arrangement 의 배치 컴포넌트 → 캔버스 블록. */
export interface ArrOption { code: string; name: string; family: string; components: number }

export async function arrangementBlocks(code: string): Promise<import('@/lib/cadTypes').CanvasBlock[] | null> {
  interface Comp { position: string; code: string; name: string; quantity: number; componentId?: number; x?: number; y?: number; w?: number; h?: number }
  try {
    const comps = await apiServer<Comp[]>(`/arrangements/${encodeURIComponent(code)}/components`)
    if (!comps.length) return null
    return comps.map((c) => ({ id: String(c.componentId ?? c.code), name: c.code, sub: c.position || `×${c.quantity}`,
      x: c.x ?? 20, y: c.y ?? 20, w: c.w ?? 130, h: c.h ?? 56 }))
  } catch { return null }
}

/** 구성도 CAD 정본 (ezdxf 작도→파싱). */
export async function arrangementCad(): Promise<CadDocument | null> {
  try {
    const r = await apiServer<{ document: CadDocument }>('/cad/arrangement')
    return r.document
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 사양 Excel Import (N5b) — Slot·Value 2열 → slotValues. */
export async function specImport(formData: FormData): Promise<{ slotValues?: Record<string, string>; error?: string }> {
  const { getToken } = await import('@/lib/session')
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: '사양 Excel 파일을 선택하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'
  const res = await fetch(`${API_BASE}/cpq/spec-import`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as { slotValues: Record<string, string> }
  return { slotValues: r.slotValues }
}
