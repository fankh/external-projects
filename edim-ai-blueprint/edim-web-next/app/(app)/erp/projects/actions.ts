'use server'

/** 프로젝트 대장 뮤테이션 (N3) — 등록(PS 자동채번)·영업단계 전이(낙관적 잠금)·삭제. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/projects'

export interface ActState { error?: string; ok?: string }

/** S-3-5 중복검토 — 이름/번호 ILIKE 실질의 (등록 전 확인). */
export async function checkProjectDuplicate(name: string): Promise<{ dup?: boolean; matches?: string[]; error?: string }> {
  if (!name.trim()) return { error: '검토할 프로젝트명을 입력하십시오' }
  try {
    const r = await apiServer<{ duplicate: boolean; matches: { no: string; name: string }[] }>(
      `/erp/projects/check-duplicate?name=${encodeURIComponent(name.trim())}`)
    const list = r.matches ?? []
    return { dup: r.duplicate, matches: list.slice(0, 5).map((d) => `${d.no} ${d.name}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '중복검토 실패' }
  }
}

export async function createProject(_prev: ActState, formData: FormData): Promise<ActState> {
  const projectName = String(formData.get('projectName') ?? '').trim()
  const client = String(formData.get('client') ?? '').trim()
  if (!projectName || !client) return { error: '프로젝트명·고객은 필수입니다' }
  const body = {
    projectName, client,
    projectType: String(formData.get('projectType') ?? '신규').trim(),
    item: String(formData.get('item') ?? '').trim(),
    clientContact: String(formData.get('clientContact') ?? '').trim(),
  }
  try {
    const r = await apiServer<{ projectNo: string }>('/projects', { method: 'POST', body: JSON.stringify(body) })
    revalidatePath(PATH)
    return { ok: `${r.projectNo} 등록` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
}

export async function setStage(no: string, stage: string, baseUpdatedAt: string): Promise<ActState> {
  try {
    await apiServer(`/projects/${encodeURIComponent(no)}`, {
      method: 'PATCH', body: JSON.stringify({ stage, baseUpdatedAt }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '단계 저장 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${no} → ${stage}` }
}

export async function deleteProject(no: string): Promise<ActState> {
  try {
    await apiServer(`/projects/${encodeURIComponent(no)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (참조 보호 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${no} 삭제` }
}
