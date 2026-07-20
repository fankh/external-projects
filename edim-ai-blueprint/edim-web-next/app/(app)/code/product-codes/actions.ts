'use server'

/** 제품 코드 마스터 뮤테이션 (N4) — 등록·상태 전이(승인/비활성/복원)·삭제. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/code/product-codes'

export interface ActState { error?: string; ok?: string }

export async function createProductCode(_prev: ActState, formData: FormData): Promise<ActState> {
  const mainCode = String(formData.get('mainCode') ?? '').trim()
  const codeName = String(formData.get('codeName') ?? '').trim()
  const groupCode = String(formData.get('groupCode') ?? '').trim()
  if (!mainCode || !codeName || !groupCode) return { error: '코드·코드명·그룹은 필수입니다' }
  try {
    await apiServer('/codes/products', { method: 'POST', body: JSON.stringify({ mainCode, codeName, groupCode }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패 (중복 409·그룹 없음 422 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${mainCode} 등록 (DRAFT)` }
}

export async function renameProductCode(id: number, codeName: string): Promise<ActState> {
  const name = codeName.trim()
  if (!name) return { error: '코드명은 비울 수 없습니다' }
  try {
    await apiServer(`/codes/products/${id}`, { method: 'PATCH', body: JSON.stringify({ codeName: name }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '코드명 수정 실패' }
  }
  revalidatePath(PATH)
  return { ok: `코드명 수정 ✓ — ${name}` }
}

/** 일괄 작업 (POST /codes/products/batch) — 다중 선택 상태 전이/삭제, 부분 실패 허용(skip 사유). */
export async function batchProductCodes(ids: number[], action: 'STATUS' | 'DELETE', status?: string): Promise<ActState> {
  if (!ids.length) return { error: '대상을 선택하십시오' }
  try {
    const r = await apiServer<{ done: number; requested: number; skipped: { code?: string; reason: string }[] }>(
      '/codes/products/batch', { method: 'POST', body: JSON.stringify({ ids, action, status: status ?? '' }) })
    revalidatePath(PATH)
    const skip = r.skipped.length
      ? ` · skip ${r.skipped.length}건 (${r.skipped.slice(0, 3).map((s) => `${s.code ?? '?'}: ${s.reason}`).join(', ')}${r.skipped.length > 3 ? ' …' : ''})`
      : ''
    return { ok: `일괄 ${action === 'DELETE' ? '삭제' : `상태→${status}`} ✓ — ${r.done}/${r.requested}건${skip}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '일괄 작업 실패' }
  }
}

export async function setProductStatus(id: number, status: string): Promise<ActState> {
  try {
    await apiServer(`/codes/products/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '상태 변경 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${id} → ${status}` }
}

export async function deleteProductCode(id: number): Promise<ActState> {
  try {
    await apiServer(`/codes/products/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (참조 보호 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `#${id} 삭제` }
}
