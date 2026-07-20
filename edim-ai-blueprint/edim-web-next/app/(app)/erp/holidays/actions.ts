'use server'

/** 공휴일 뮤테이션 — 서버 액션 → FastAPI → revalidatePath(SSR 재검증). P4 표준 패턴. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/holidays'

export interface FormState { error?: string; ok?: string }

export async function addHoliday(_prev: FormState, formData: FormData): Promise<FormState> {
  const date = String(formData.get('date') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!date || !name) return { error: '날짜·공휴일명을 입력하십시오' }
  try {
    await apiServer('/calendar/holidays', { method: 'POST', body: JSON.stringify({ date, name }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${date} ${name} 등록` }
}

/** 영업일 계산기 (GET /calendar/workdays·/due) — 구간 영업일 수·N영업일 후 납기. */
export async function calcWorkdays(start: string, end: string): Promise<{ workdays?: number; error?: string }> {
  try {
    const r = await apiServer<{ workdays: number }>(`/calendar/workdays?start=${start}&end=${end}`)
    return { workdays: r.workdays }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '계산 실패' }
  }
}

export async function calcDue(start: string, days: number): Promise<{ due?: string; error?: string }> {
  try {
    const r = await apiServer<{ due: string }>(`/calendar/due?start=${start}&days=${days}`)
    return { due: r.due }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '계산 실패' }
  }
}

export async function deleteHoliday(id: number): Promise<FormState> {
  try {
    await apiServer(`/calendar/holidays/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '삭제' }
}
