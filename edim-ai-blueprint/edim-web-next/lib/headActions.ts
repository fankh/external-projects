'use server'

/** Head Registry 서버 액션 (4.0 — 요구 #14·#19·#21). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface HeadRow {
  headId: number; headCode: string; headName: string; headType: 'SYSTEM' | 'TENANT'
  minLevel: string; status: string; sortOrder: number; note: string
  bindings: number; centerBindings: number; publishable: boolean
}
export interface HeadBinding {
  bindingId: number; panel: 'LEFT' | 'CENTER' | 'RIGHT'
  targetKind: 'SCREEN' | 'PROCESS' | 'TEMPLATE'; targetRef: string; label: string; sortOrder: number
}
export interface HeadDetail extends Omit<HeadRow, 'bindings' | 'centerBindings'> {
  bindings: HeadBinding[]; publishable: boolean
}
export interface ActState { error?: string; ok?: string }

export async function listHeads(editing = false): Promise<HeadRow[]> {
  try {
    return await apiServer<HeadRow[]>(`/heads${editing ? '?editing=true' : ''}`)
  } catch { return [] }
}

export async function getHead(id: number): Promise<HeadDetail | null> {
  try { return await apiServer<HeadDetail>(`/heads/${id}`) } catch { return null }
}

export async function createHead(_prev: ActState, fd: FormData): Promise<ActState> {
  const headCode = String(fd.get('headCode') ?? '').trim()
  const headName = String(fd.get('headName') ?? '').trim()
  if (!headCode || !headName) return { error: 'Head 코드·이름은 필수입니다' }
  try {
    await apiServer('/heads', { method: 'POST', body: JSON.stringify({
      headCode, headName,
      headType: String(fd.get('headType') ?? 'TENANT'),
      minLevel: String(fd.get('minLevel') ?? 'GENERAL'),
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
    }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Head 등록 실패 (중복 409 가능)' }
  }
  revalidatePath('/erp/heads')
  return { ok: `${headCode} 등록 (DRAFT)` }
}

export async function setHeadStatus(id: number, status: string): Promise<ActState> {
  try {
    const r = await apiServer<{ headCode: string; status: string }>(`/heads/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
    revalidatePath('/erp/heads')
    return { ok: `${r.headCode} → ${r.status}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '상태 전이 실패' }
  }
}

export async function deleteHead(id: number): Promise<ActState> {
  try {
    await apiServer(`/heads/${id}`, { method: 'DELETE' })
    revalidatePath('/erp/heads')
    return { ok: `#${id} 삭제` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (게시본은 회수 후)' }
  }
}

export async function addBinding(headId: number, panel: string, targetKind: string,
                                 targetRef: string, label: string): Promise<ActState> {
  if (!targetRef.trim()) return { error: '대상(화면 경로 등)을 입력하십시오' }
  try {
    await apiServer(`/heads/${headId}/bindings`, {
      method: 'POST', body: JSON.stringify({ panel, targetKind, targetRef, label }),
    })
    revalidatePath('/erp/heads')
    return { ok: `${panel} 바인딩 추가 — ${targetRef}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '바인딩 실패' }
  }
}

export async function removeBinding(headId: number, bindingId: number): Promise<ActState> {
  try {
    await apiServer(`/heads/${headId}/bindings/${bindingId}`, { method: 'DELETE' })
    revalidatePath('/erp/heads')
    return { ok: `바인딩 #${bindingId} 삭제` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '바인딩 삭제 실패' }
  }
}

export async function seedHeads(): Promise<ActState> {
  try {
    const r = await apiServer<{ seeded: number }>('/heads/seed', { method: 'POST' })
    revalidatePath('/erp/heads')
    return { ok: `표준 Head ${r.seeded}종 생성` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Head 시드 실패' }
  }
}

/** 승인 경유 요청 (#21) — 승인함으로 넘긴다. */
export async function requestHeadApproval(id: number, label: string): Promise<ActState> {
  try {
    await apiServer('/heads/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'REVIEW' }) })
    await apiServer('/approvals', { method: 'POST', body: JSON.stringify({
      targetTable: 'sys_head', targetId: id, requestType: 'UPDATE', label,
    }) })
    revalidatePath('/erp/heads')
    return { ok: `${label} 승인 요청 (REVIEW)` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}
