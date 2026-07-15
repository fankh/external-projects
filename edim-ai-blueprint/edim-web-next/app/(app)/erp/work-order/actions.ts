'use server'

/** 작업지시 뮤테이션 (N3) — 발행·상태전이 (ISSUED→STARTED→DONE). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/work-order'

export interface ActState { error?: string; ok?: string }

export async function issueWorkOrder(_prev: ActState, formData: FormData): Promise<ActState> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: '제목은 필수입니다' }
  const body = {
    title,
    drawingNo: String(formData.get('drawingNo') ?? '').trim() || undefined,
    projectNo: String(formData.get('projectNo') ?? '').trim() || undefined,
    assignee: String(formData.get('assignee') ?? '').trim() || undefined,
    assemblyNote: String(formData.get('assemblyNote') ?? '').trim() || undefined,
  }
  try {
    const r = await apiServer<{ woNo: string }>('/erp/work-orders', { method: 'POST', body: JSON.stringify(body) })
    revalidatePath(PATH)
    return { ok: `${r.woNo} 발행` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '발행 실패' }
  }
}

export async function transitionWorkOrder(woNo: string, status: 'STARTED' | 'DONE'): Promise<ActState> {
  try {
    await apiServer(`/erp/work-orders/${encodeURIComponent(woNo)}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '전이 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${woNo} → ${status === 'STARTED' ? '착수' : '완료'}` }
}
