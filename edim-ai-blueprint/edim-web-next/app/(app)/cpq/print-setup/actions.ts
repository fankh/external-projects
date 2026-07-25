'use server'

import { apiServer, ApiError } from '@/lib/api'

/** Print Form 게시 승인 요청 (CPQ-013). */
export async function publishForm(form: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/approvals', { method: 'POST', body: JSON.stringify({ targetTable: 'doc_control', targetId: 0, requestType: 'UPDATE', label: `Print Form 게시 — ${form}`, targetCode: form }) })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}

/** U6 잔여 — 양식 자리표시자 배치 저장·복원 (tbx_ui_form 재사용, form_type=PRINT_FORM). */
export interface FormBoxDef { id: number; label: string; x: number; y: number; w: number; h: number; dashed?: boolean }

const FORM_NAME = 'PRINT_FORM_LAYOUT'

export async function loadFormLayout(): Promise<{ layout: FormBoxDef[]; version: number } | null> {
  try {
    const r = await apiServer<{ version: number; layout: FormBoxDef[] }>(`/toolbox/forms/${FORM_NAME}`)
    return Array.isArray(r.layout) && r.layout.length ? { layout: r.layout, version: r.version } : null
  } catch { return null }   // 404 = 미저장(기본 배치 사용) — 정상 경로
}

export async function saveFormLayout(layout: FormBoxDef[]): Promise<{ version?: number; error?: string }> {
  try {
    const r = await apiServer<{ version: number }>(`/toolbox/forms/${FORM_NAME}`, {
      method: 'PUT', body: JSON.stringify({ layout, formType: 'PRINT_FORM' }),
    })
    return { version: r.version }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '자리표시자 배치 저장 실패' }
  }
}
