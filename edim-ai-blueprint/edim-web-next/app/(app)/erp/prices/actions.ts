'use server'

/** 단가 대장 뮤테이션 (N3b) — 등록·적용 종료 마감·Excel Import. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const PATH = '/erp/prices'
const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface ActState { error?: string; ok?: string }

/** 단가 해석 (GET /prices/resolve) — 코드·기준일의 유효 단가 1건 (소스 우선순위). */
export interface ResolvedPrice { code: string; name: string; source: string; price: number; from: string; to: string | null; supplier: string }

export async function resolvePrice(code: string, at?: string): Promise<{ result?: ResolvedPrice; error?: string }> {
  if (!code.trim()) return { error: '코드를 입력하십시오' }
  try {
    const q = at ? `&at=${at}` : ''
    return { result: await apiServer<ResolvedPrice>(`/prices/resolve?code=${encodeURIComponent(code.trim())}${q}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '단가 해석 실패' }
  }
}

export async function createPrice(_prev: ActState, formData: FormData): Promise<ActState> {
  const code = String(formData.get('code') ?? '').trim()
  const supplier = String(formData.get('supplier') ?? '').trim()
  const price = Number(formData.get('price') ?? 0)
  if (!code || !supplier || !price) return { error: '코드·공급처·단가는 필수입니다' }
  const body = {
    code, supplier, price,
    source: String(formData.get('source') ?? 'PURCHASE').trim(),
    validFrom: String(formData.get('validFrom') ?? '').trim(),
    validTo: String(formData.get('validTo') ?? '').trim() || null,
  }
  try {
    await apiServer('/prices', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패 (기간 중복 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${code} ₩${price.toLocaleString()} 등록` }
}

export async function closePrice(priceId: number, validTo: string): Promise<ActState> {
  if (!validTo.trim()) return { error: '적용 종료일을 입력하십시오' }
  try {
    await apiServer(`/prices/${priceId}`, { method: 'PATCH', body: JSON.stringify({ validTo: validTo.trim() }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '마감 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${priceId} → ${validTo} 마감` }
}

export async function importPricesExcel(_prev: ActState, formData: FormData): Promise<ActState> {
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: 'Excel 파일을 선택하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/prices/import-excel`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as { inserted: number; rejected: string[] }
  revalidatePath(PATH)
  return { ok: `Import — 등록 ${r.inserted}건${r.rejected?.length ? ` · 거부 ${r.rejected.length}건 (${r.rejected[0]}${r.rejected.length > 1 ? ' 외' : ''})` : ''}` }
}
