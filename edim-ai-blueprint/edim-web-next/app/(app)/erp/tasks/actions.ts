'use server'

/** 업무함·이벤트 액션 (N1) — 완료/재배정/에스컬레이션 → revalidatePath. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface EventActionState { error?: string; ok?: string }

function refresh() {
  revalidatePath('/erp/tasks')
  revalidatePath('/detail/event')
}

export async function completeEvent(eventId: number, comment: string): Promise<EventActionState> {
  try {
    await apiServer(`/erp/events/${eventId}/complete`, {
      method: 'POST', body: JSON.stringify({ comment }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '완료 처리 실패' }
  }
  refresh()
  return { ok: `#${eventId} 완료 처리` }
}

export async function reassignEvent(eventId: number, assignee: string, comment: string): Promise<EventActionState> {
  if (!assignee.trim()) return { error: '재배정 담당자 로그인 ID 를 입력하십시오' }
  try {
    await apiServer(`/erp/events/${eventId}`, {
      method: 'PATCH', body: JSON.stringify({ assignee: assignee.trim(), comment }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '재배정 실패' }
  }
  refresh()
  return { ok: `#${eventId} → ${assignee.trim()} 재배정` }
}

export async function escalateEvent(eventId: number, reason: string): Promise<EventActionState> {
  try {
    await apiServer(`/erp/events/${eventId}/escalate`, {
      method: 'POST', body: JSON.stringify({ reason }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '에스컬레이션 실패' }
  }
  refresh()
  return { ok: `#${eventId} 에스컬레이션 — 관리자 통보` }
}
