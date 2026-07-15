'use server'

/** 도면 대장 뮤테이션 (N2) — 등록·Rev-up·Supersedure·단계 승인. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/plm/drawings'

export interface ActState { error?: string; ok?: string }

export async function createDrawing(_prev: ActState, formData: FormData): Promise<ActState> {
  const drawingNo = String(formData.get('drawingNo') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const drawingType = String(formData.get('drawingType') ?? 'PART').trim()
  const kind = String(formData.get('kind') ?? '2D').trim()
  if (!drawingNo || !name) return { error: '도면번호·도면명은 필수입니다' }
  try {
    await apiServer('/drawings', { method: 'POST', body: JSON.stringify({ drawingNo, name, drawingType, kind }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${drawingNo} 등록 (Rev.A)` }
}

export async function revUp(drawingNo: string, reason: string): Promise<ActState> {
  if (!reason.trim()) return { error: 'Rev 사유를 입력하십시오' }
  try {
    const r = await apiServer<{ rev: string }>(`/drawings/${encodeURIComponent(drawingNo)}/revisions`, {
      method: 'POST', body: JSON.stringify({ reason }),
    })
    revalidatePath(PATH)
    return { ok: `${drawingNo} → Rev.${r.rev}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Rev 올리기 실패' }
  }
}

export async function addSupersedure(oldNo: string, newNo: string, reason: string): Promise<ActState> {
  if (!oldNo.trim() || !newNo.trim()) return { error: '구도면·신도면 번호를 입력하십시오' }
  try {
    await apiServer('/drawings/supersedures', {
      method: 'POST', body: JSON.stringify({ oldNo: oldNo.trim(), newNo: newNo.trim(), reason }),
    })
    revalidatePath(PATH)
    return { ok: `대체 등록 — ${oldNo} → ${newNo}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '대체 등록 실패' }
  }
}

export async function decideStep(drawingNo: string, step: string, approve: boolean, comment: string): Promise<ActState> {
  if (!approve && !comment.trim()) return { error: '반려는 코멘트가 필요합니다' }
  try {
    const r = await apiServer<{ drawingStatus: string | null }>(
      `/drawings/${encodeURIComponent(drawingNo)}/approvals`,
      { method: 'POST', body: JSON.stringify({ step, approve, comment }) })
    revalidatePath(PATH)
    return { ok: `${step} ${approve ? '승인' : '반려'} — 상태 ${r.drawingStatus ?? '—'}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '단계 승인 실패' }
  }
}
