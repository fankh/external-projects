'use server'

/** 개발서버 전용 — 요구사항 접수 (dev_requirement) 서버 액션 (레거시 Shell DevReqDialog 이식). */
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface DevRequirement {
  reqId: number; screenId: string; category: string; title: string; content: string
  priority: string; status: string; requester: string; resolution: string
  createdAt: string; resolvedAt: string | null; imageCount: number
}

export async function devReqList(): Promise<DevRequirement[] | { error: string }> {
  try {
    return await apiServer<DevRequirement[]>('/dev/requirements')
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '조회 실패' }
  }
}

export async function devReqCreate(body: {
  title: string; content: string; category: string; priority: string; screenId: string
}): Promise<{ reqId?: number; error?: string }> {
  try {
    const r = await apiServer<{ reqId: number }>('/dev/requirements', {
      method: 'POST', body: JSON.stringify(body),
    })
    return { reqId: r.reqId }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
}

export async function devReqSetStatus(reqId: number, status: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await apiServer(`/dev/requirements/${reqId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '상태 변경 실패' }
  }
}

export async function devReqUploadImage(reqId: number, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: '이미지 파일이 없습니다' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/dev/requirements/${reqId}/images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  return { ok: true }
}

export async function devReqImages(reqId: number): Promise<{ imageId: number; fileName: string }[]> {
  try {
    return await apiServer<{ imageId: number; fileName: string }[]>(`/dev/requirements/${reqId}/images`)
  } catch {
    return []
  }
}
