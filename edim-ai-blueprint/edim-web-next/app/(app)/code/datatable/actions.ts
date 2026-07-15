'use server'

/** 데이터 Table 뮤테이션 (N4b) — 행 추가/수정/삭제 + Excel Import. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const PATH = '/code/datatable'
const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface ActState { error?: string; ok?: string }

export async function addTableRow(name: string, key: string, values: Record<string, number | null>): Promise<ActState> {
  if (!key.trim()) return { error: 'Key 를 입력하십시오' }
  try {
    await apiServer(`/tables/${encodeURIComponent(name)}/rows`, {
      method: 'POST', body: JSON.stringify({ key: key.trim(), values }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '행 추가 실패 (Key 중복 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `행 ${key} 추가` }
}

export async function updateTableRow(name: string, key: string, values: Record<string, number | null>): Promise<ActState> {
  try {
    await apiServer(`/tables/${encodeURIComponent(name)}/rows/${encodeURIComponent(key)}`, {
      method: 'PUT', body: JSON.stringify({ key, values }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
  revalidatePath(PATH)
  return { ok: `행 ${key} 저장` }
}

export async function deleteTableRow(name: string, key: string): Promise<ActState> {
  try {
    await apiServer(`/tables/${encodeURIComponent(name)}/rows/${encodeURIComponent(key)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '행 삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: `행 ${key} 삭제` }
}

export async function importTableExcel(_prev: ActState, formData: FormData): Promise<ActState> {
  const name = String(formData.get('name') ?? '').trim()
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: 'Excel 파일을 선택하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(name)}/import-excel`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as { inserted: number; updated: number; rejected: string[] }
  revalidatePath(PATH)
  return { ok: `Import — 추가 ${r.inserted} · 갱신 ${r.updated}${r.rejected?.length ? ` · 거부 ${r.rejected.length}` : ''}` }
}
