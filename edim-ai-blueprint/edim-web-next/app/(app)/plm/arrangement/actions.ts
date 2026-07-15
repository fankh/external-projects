'use server'

/** Arrangement Set-Up (M-4-2) 뮤테이션 (N2) — 구성 코드 등록 + 구성품 CRUD. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/plm/arrangement'

export interface ActState { error?: string; ok?: string }

export async function createArrangement(_prev: ActState, formData: FormData): Promise<ActState> {
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!code || !name) return { error: '구성 Code·이름은 필수입니다' }
  const body = {
    code, name,
    family: String(formData.get('family') ?? '').trim(),
    direction: String(formData.get('direction') ?? '').trim(),
    install: String(formData.get('install') ?? '').trim(),
  }
  try {
    await apiServer('/arrangements', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${code} 등록 (승인 요청 자동)` }
}

export async function addComponent(code: string, productCode: string, position: string, quantity: number): Promise<ActState> {
  if (!productCode.trim()) return { error: '구성품 코드를 입력하십시오' }
  try {
    await apiServer(`/arrangements/${encodeURIComponent(code)}/components`, {
      method: 'POST', body: JSON.stringify({ productCode: productCode.trim(), position: position.trim(), quantity }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '구성품 추가 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${productCode} ×${quantity} 추가` }
}

export async function patchComponentQty(code: string, componentId: number, quantity: number): Promise<ActState> {
  try {
    await apiServer(`/arrangements/${encodeURIComponent(code)}/components/${componentId}`, {
      method: 'PATCH', body: JSON.stringify({ quantity }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수량 수정 실패' }
  }
  revalidatePath(PATH)
  return { ok: `수량 → ${quantity}` }
}

export async function deleteComponent(code: string, componentId: number): Promise<ActState> {
  try {
    await apiServer(`/arrangements/${encodeURIComponent(code)}/components/${componentId}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '구성품 삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '구성품 삭제' }
}
