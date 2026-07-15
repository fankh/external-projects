'use server'

/** 마일스톤 뮤테이션 (N3) — 납기 등록·완료 처리. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/milestones'

export interface ActState { error?: string; ok?: string }

export async function addMilestone(_prev: ActState, formData: FormData): Promise<ActState> {
  const projectNo = String(formData.get('projectNo') ?? '').trim()
  const stage = String(formData.get('stage') ?? '').trim()
  const plannedDate = String(formData.get('plannedDate') ?? '').trim()
  if (!projectNo || !stage || !plannedDate) return { error: '프로젝트·단계·계획일은 필수입니다' }
  try {
    await apiServer('/erp/milestones', {
      method: 'POST',
      body: JSON.stringify({ projectNo, stage, plannedDate, note: String(formData.get('note') ?? '').trim() }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${projectNo} ${stage} ${plannedDate} 등록` }
}

export async function completeMilestone(milestoneId: number, actualDate: string): Promise<ActState> {
  try {
    await apiServer(`/erp/milestones/${milestoneId}/done`, {
      method: 'PATCH', body: JSON.stringify({ actualDate }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '완료 처리 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${milestoneId} 완료` }
}
