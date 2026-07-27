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

// 18.69 — 금액은 **서버가 단가에서 집계한다**. 종전엔 화면이 계산해 보냈는데, 원가 열람이
// 마스킹된 사용자는 가려진 값으로 더하므로 틀린 금액의 발주서가 만들어졌다.
export async function createPo(
  codes: string[],
  cond: { deliveryTerms: string; transport: string; minOrderQty: number; certRequired: boolean },
): Promise<ActState> {
  if (codes.length === 0) return { error: '발주할 품목을 선택하십시오' }
  try {
    const r = await apiServer<{ poNo: string; terms: string; totalK: number; unpricedCodes: string[]; assumedQtyCodes: string[] }>('/erp/po', {
      method: 'POST', body: JSON.stringify({ codes, ...cond }),
    })
    revalidatePath(PATH)
    const skipped = r.unpricedCodes?.length ? ` · 단가 미등록 제외: ${r.unpricedCodes.join(', ')}` : ''
    const assumed = r.assumedQtyCodes?.length ? ` · 소요수량 1 가정: ${r.assumedQtyCodes.join(', ')}` : ''
    return { ok: `${r.poNo} 발주 확정 — ${codes.length}품목 ${r.totalK.toLocaleString()}K (${r.terms})${skipped}${assumed}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '발주 실패' }
  }
}
