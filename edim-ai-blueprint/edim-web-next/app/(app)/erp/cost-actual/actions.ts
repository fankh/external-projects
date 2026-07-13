'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/cost-actual'
export interface FormState { error?: string; ok?: string }

export async function recordActual(_prev: FormState, formData: FormData): Promise<FormState> {
  const category = String(formData.get('category') ?? 'MATERIAL')
  const itemName = String(formData.get('itemName') ?? '').trim()
  const poNo = String(formData.get('poNo') ?? '').trim() || undefined
  const projectNo = String(formData.get('projectNo') ?? '').trim() || undefined
  const qty = Number(String(formData.get('qty') ?? '').replace(/[^\d.]/g, ''))
  const unitPrice = Number(String(formData.get('unitPrice') ?? '').replace(/[^\d.]/g, ''))
  if (!(qty > 0) || !(unitPrice >= 0)) return { error: '수량(>0)·단가(≥0) 확인' }
  try {
    const r = await apiServer<{ amount: number }>('/cost/actuals', {
      method: 'POST', body: JSON.stringify({ category, itemName, poNo, projectNo, qty, unitPrice }),
    })
    revalidatePath(PATH)
    return { ok: `실적 적재 — ${category} ₩${Math.round(r.amount).toLocaleString()}${projectNo ? ` · ${projectNo}` : ''}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '적재 실패' }
  }
}
