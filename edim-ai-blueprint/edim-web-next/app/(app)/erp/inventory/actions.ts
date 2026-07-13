'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/inventory'
export interface FormState { error?: string; ok?: string }

export async function inbound(_prev: FormState, formData: FormData): Promise<FormState> {
  const itemCode = String(formData.get('itemCode') ?? '').trim()
  const locationCode = String(formData.get('locationCode') ?? '').trim()
  const quantity = Number(String(formData.get('quantity') ?? '').replace(/[^\d.]/g, ''))
  const lotNo = String(formData.get('lotNo') ?? '').trim() || undefined
  const serialNo = String(formData.get('serialNo') ?? '').trim() || undefined
  const priceRaw = String(formData.get('unitPrice') ?? '').trim()
  const unitPrice = priceRaw ? Number(priceRaw.replace(/[^\d.]/g, '')) : undefined
  if (!itemCode || !locationCode || !(quantity > 0)) return { error: '품목·위치·수량(>0) 필요' }
  try {
    const r = await apiServer<{ onHand: number; avgPrice: number; priceAuto: boolean; value: number }>(
      '/erp/stock/inbound',
      { method: 'POST', body: JSON.stringify({ itemCode, locationCode, quantity, refNo: 'MI-NEXT', lotNo, serialNo, unitPrice }) })
    revalidatePath(PATH)
    return { ok: `${itemCode} +${quantity} @ ${locationCode} · 단가 ₩${Math.round(r.avgPrice).toLocaleString()}${r.priceAuto ? '(자동)' : ''}·평가 ₩${Math.round(r.value).toLocaleString()} (재고 ${r.onHand})` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '입고 실패' }
  }
}
