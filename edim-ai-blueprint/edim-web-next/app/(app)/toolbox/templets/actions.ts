'use server'

/** Templet 관리 뮤테이션 (N5b) — upsert DRAFT(JSON 정의)·삭제. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/toolbox/templets'

export interface ActState { error?: string; ok?: string }

export async function saveTemplet(name: string, templetType: string, definitionJson: string): Promise<ActState> {
  if (!name.trim()) return { error: 'Templet 이름을 입력하십시오' }
  let definition: Record<string, unknown>
  try {
    definition = JSON.parse(definitionJson || '{}') as Record<string, unknown>
  } catch {
    return { error: 'JSON 정의 구문 오류' }
  }
  try {
    await apiServer(`/toolbox/templets/${encodeURIComponent(name.trim())}`, {
      method: 'PUT', body: JSON.stringify({ templetType, definition }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${name} 저장 (DRAFT)` }
}

export async function deleteTemplet(name: string): Promise<ActState> {
  try {
    await apiServer(`/templets/${encodeURIComponent(name)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (시스템·RELEASED 보호 409)' }
  }
  revalidatePath(PATH)
  return { ok: `${name} 삭제` }
}
