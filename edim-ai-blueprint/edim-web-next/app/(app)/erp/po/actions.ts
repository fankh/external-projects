'use server'

/** 발주 라이프사이클 뮤테이션 (N3b) — 생성·승인·입고(GR, 초과 수량 차단은 서버). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/po'

export interface ActState { error?: string; ok?: string }

export async function createPoOrder(_prev: ActState, formData: FormData): Promise<ActState> {
  const itemsRaw = String(formData.get('items') ?? '').trim()
  if (!itemsRaw) return { error: '품목을 입력하십시오 (품명,수량,단가 — 줄당 1건)' }
  const items: { itemName: string; qty: number; unitPrice: number }[] = []
  for (const line of itemsRaw.split('\n')) {
    const [name, qty, price] = line.split(',').map((s) => s.trim())
    if (!name) continue
    items.push({ itemName: name, qty: Number(qty) || 1, unitPrice: Number(price) || 0 })
  }
  if (items.length === 0) return { error: '유효한 품목이 없습니다' }
  const body = {
    supplier: String(formData.get('supplier') ?? '').trim() || undefined,
    expectedDate: String(formData.get('expectedDate') ?? '').trim() || undefined,
    note: String(formData.get('note') ?? '').trim() || undefined,
    items,
  }
  try {
    const r = await apiServer<{ poNo: string }>('/erp/pos', { method: 'POST', body: JSON.stringify(body) })
    revalidatePath(PATH)
    return { ok: `${r.poNo} 생성 (${items.length}품목)` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '발주 생성 실패' }
  }
}

export async function approvePo(poNo: string): Promise<ActState> {
  try {
    await apiServer(`/erp/pos/${encodeURIComponent(poNo)}/approve`, { method: 'PATCH', body: '{}' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${poNo} 승인` }
}

export async function receivePo(poNo: string, items: { poItemId: number; qty: number }[]): Promise<ActState> {
  const filled = items.filter((i) => i.qty > 0)
  if (filled.length === 0) return { error: '입고 수량을 입력하십시오' }
  try {
    const r = await apiServer<{ received: number; status: string }>(
      `/erp/pos/${encodeURIComponent(poNo)}/receive`,
      { method: 'POST', body: JSON.stringify({ items: filled }) })
    revalidatePath(PATH)
    return { ok: `${poNo} 입고 ${r.received}건 — 상태 ${r.status}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '입고 실패 (발주 수량 초과 차단 가능)' }
  }
}
