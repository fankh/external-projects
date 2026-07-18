'use server'

/** 재고 예약 뮤테이션 (N3b) — 예약(가용 초과 409)·해제. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/inventory'

export interface ActState { error?: string; ok?: string }

export async function reserveStock(itemCode: string, quantity: number, refNo: string): Promise<ActState> {
  if (!itemCode.trim() || quantity <= 0) return { error: '품목 코드·수량을 입력하십시오' }
  try {
    const r = await apiServer<{ reservationId: number; available: number }>('/erp/stock/reserve', {
      method: 'POST',
      body: JSON.stringify({ itemCode: itemCode.trim(), quantity, refType: refNo ? 'WO' : undefined, refNo: refNo || undefined }),
    })
    revalidatePath(PATH)
    return { ok: `예약 #${r.reservationId} — 잔여 가용 ${r.available}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '예약 실패 (가용 초과 409 가능)' }
  }
}

export async function releaseReservation(id: number): Promise<ActState> {
  try {
    const r = await apiServer<{ available: number }>(`/erp/stock/reservations/${id}/release`, { method: 'POST', body: '{}' })
    revalidatePath(PATH)
    return { ok: `예약 #${id} 해제 — 가용 ${r.available}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '해제 실패' }
  }
}

/** U5 로트 유통기한 설정/해제. */
export async function setLotExpiry(itemCode: string, lotNo: string, expiryDate: string): Promise<ActState> {
  try {
    await apiServer('/erp/stock/lots/expiry', {
      method: 'PATCH', body: JSON.stringify({ itemCode, lotNo, expiryDate }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '유통기한 설정 실패' }
  }
  revalidatePath('/erp/inventory')
  return { ok: `${itemCode}/${lotNo} 유통기한 ${expiryDate || '해제'}` }
}
