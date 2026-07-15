'use server'

/** 배리언트 상수 뮤테이션 (N4) — 값 등록(PENDING 승인 흐름)·수정·폐기. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/code/variant'

export interface ActState { error?: string; ok?: string }

export async function addCodeValue(_prev: ActState, formData: FormData): Promise<ActState> {
  const group = String(formData.get('group') ?? '').trim()
  const slot = String(formData.get('slot') ?? '').trim()
  const valueCode = String(formData.get('valueCode') ?? '').trim()
  const valueName = String(formData.get('valueName') ?? '').trim()
  if (!group || !slot || !valueCode) return { error: '그룹·Slot·값 코드는 필수입니다' }
  try {
    await apiServer('/codes/values', { method: 'POST', body: JSON.stringify({ group, slot, valueCode, valueName }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${slot}=${valueCode} 등록 (PENDING 승인)` }
}

export async function patchCodeValue(valueId: number, p: { valueName?: string; deprecate?: boolean }): Promise<ActState> {
  try {
    await apiServer(`/codes/values/${valueId}`, { method: 'PATCH', body: JSON.stringify(p) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패' }
  }
  revalidatePath(PATH)
  return { ok: p.deprecate ? `#${valueId} 폐기 (DEPRECATED)` : `#${valueId} 수정` }
}
