'use server'

/** Raw Material·GPI 뮤테이션 (N4) — 재질 등록·수정. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/code/materials'

export interface ActState { error?: string; ok?: string }

export async function createMaterial(_prev: ActState, formData: FormData): Promise<ActState> {
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!code || !name) return { error: '재질 코드·재질명은 필수입니다' }
  const density = String(formData.get('density') ?? '').trim()
  const body = {
    code, name,
    materialType: String(formData.get('materialType') ?? 'STEEL').trim(),
    density: density ? Number(density) : null,
    standard: String(formData.get('standard') ?? '').trim(),
    hazard: String(formData.get('hazard') ?? '').trim(),
  }
  try {
    await apiServer('/materials', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${code} 등록` }
}

export async function updateMaterial(code: string, p: { name?: string; density?: number | null; standard?: string }): Promise<ActState> {
  try {
    await apiServer(`/materials/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(p) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${code} 수정` }
}
