'use server'

/** Project Folder 뮤테이션 (N5) — 파일 업로드 (MinIO + dwg_file 등록). */
import { revalidatePath } from 'next/cache'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface ActState { error?: string; ok?: string }

export async function uploadProjectFile(_prev: ActState, formData: FormData): Promise<ActState> {
  const file = formData.get('uploadedFile')
  const folder = String(formData.get('folder') ?? 'RECEIVED').trim()
  const project = String(formData.get('project') ?? '').trim()
  if (!(file instanceof File) || file.size === 0) return { error: '업로드할 파일을 선택하십시오' }
  if (!project) return { error: '프로젝트를 지정하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  fd.append('folder', folder)
  fd.append('project', project)
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  revalidatePath('/common/folder')
  return { ok: `${file.name} 업로드 (${folder})` }
}
