'use server'

/** 도면 BOM 라인 편집 (미배선 API 배선 4차) — POST/DELETE /drawings/{no}/bom. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface BomActState { error?: string; ok?: string }

export async function addBomLine(drawing: string, partNo: string, qty: number, assemblySeq: number | null, note: string): Promise<BomActState> {
  if (!partNo.trim()) return { error: '부품번호를 입력하십시오' }
  try {
    const r = await apiServer<{ bomId: number; itemNo: number }>(
      `/drawings/${encodeURIComponent(drawing)}/bom`,
      { method: 'POST', body: JSON.stringify({ partNo: partNo.trim(), qty: qty || 1, assemblySeq, assemblyNote: note }) })
    revalidatePath('/detail/part')
    return { ok: `BOM 추가 ✓ — No.${r.itemNo} ${partNo.trim()} ×${qty || 1}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'BOM 추가 실패 (부품 미등록 422·중복 409)' }
  }
}

export async function deleteBomLine(drawing: string, bomId: number): Promise<BomActState> {
  try {
    await apiServer(`/drawings/${encodeURIComponent(drawing)}/bom/${bomId}`, { method: 'DELETE' })
    revalidatePath('/detail/part')
    return { ok: `BOM #${bomId} 삭제 ✓` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'BOM 삭제 실패' }
  }
}
