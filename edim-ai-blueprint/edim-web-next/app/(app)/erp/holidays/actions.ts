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

export async function deleteHoliday(id: number): Promise<FormState> {
  try {
    await apiServer(`/calendar/holidays/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '삭제' }
}
