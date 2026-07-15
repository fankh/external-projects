'use server'

/** 구매·발주 요청 뮤테이션 (N3b) — QCR 발행 + PO 조건 발주 (doc_control). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/purchase'

export interface ActState { error?: string; ok?: string }

export async function issueQcr(codes: string[], note: string): Promise<ActState> {
  if (codes.length === 0) return { error: 'QCR 발행할 품목을 선택하십시오' }
  try {
    const r = await apiServer<{ qcrNo: string }>('/erp/qcr', {
      method: 'POST', body: JSON.stringify({ codes, note }),
    })
    revalidatePath(PATH)
    return { ok: `${r.qcrNo} 발행 — ${codes.length}품목 견적 요청` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'QCR 발행 실패' }
  }
}

export async function createPo(
  codes: string[], totalK: number,
  cond: { deliveryTerms: string; transport: string; minOrderQty: number; certRequired: boolean },
): Promise<ActState> {
  if (codes.length === 0) return { error: '발주할 품목을 선택하십시오' }
  try {
    const r = await apiServer<{ poNo: string; terms: string }>('/erp/po', {
      method: 'POST', body: JSON.stringify({ codes, totalK, ...cond }),
    })
    revalidatePath(PATH)
    return { ok: `${r.poNo} 발주 확정 — ${codes.length}품목 (${r.terms})` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '발주 실패' }
  }
}
