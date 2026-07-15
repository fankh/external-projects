'use server'

/** 검사·품질 뮤테이션 (N3b) — 검사 등록 (불합격 시 이상 이벤트 자동 승격). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface ActState { error?: string; ok?: string }

export async function createInspection(_prev: ActState, formData: FormData): Promise<ActState> {
  const inspType = String(formData.get('inspType') ?? 'INCOMING').trim()
  const result = String(formData.get('result') ?? 'PASS').trim()
  const itemCode = String(formData.get('itemCode') ?? '').trim()
  if (!itemCode) return { error: '품목 코드를 입력하십시오' }
  const body = {
    inspType, result, itemCode,
    refNo: String(formData.get('refNo') ?? '').trim() || undefined,
    itemName: String(formData.get('itemName') ?? '').trim() || undefined,
    measured: String(formData.get('measured') ?? '').trim() || undefined,
  }
  try {
    const r = await apiServer<{ inspNo: string }>('/qc/inspections', { method: 'POST', body: JSON.stringify(body) })
    revalidatePath('/erp/quality')
    return { ok: `${r.inspNo} 등록 (${result})${result === 'FAIL' ? ' — 이상 이벤트 승격' : ''}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '검사 등록 실패' }
  }
}
