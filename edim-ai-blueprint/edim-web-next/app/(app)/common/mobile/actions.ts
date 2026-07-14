'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** 모바일 승인/반려 (APP-002). */
export async function decideApproval(id: number, approve: boolean): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer(`/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify({ approve, comment: approve ? '모바일 승인 (APP-002)' : '모바일 반려 (APP-002)' }) })
    revalidatePath('/common/mobile')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '처리 실패' }
  }
}

/** 모바일 업무 완료 처리. */
export async function completeEvent(eventId: number): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer(`/erp/events/${eventId}/complete`, { method: 'POST', body: JSON.stringify({ comment: '모바일 완료 처리' }) })
    revalidatePath('/common/mobile')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '완료 실패' }
  }
}

/** 모바일 입고 처리 (MI-002). */
export async function inboundStock(itemCode: string, quantity: number): Promise<{ result?: { onHand: number; avgPrice: number; value: number }; error?: string }> {
  try {
    const result = await apiServer<{ onHand: number; avgPrice: number; priceAuto: boolean; value: number }>('/erp/stock/inbound', {
      method: 'POST', body: JSON.stringify({ itemCode: itemCode.trim(), itemName: 'Motor H22 380V', locationCode: 'WS-1', quantity, refNo: 'MI-MOBILE' }),
    })
    revalidatePath('/common/mobile')
    return { result }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '입고 실패' }
  }
}
