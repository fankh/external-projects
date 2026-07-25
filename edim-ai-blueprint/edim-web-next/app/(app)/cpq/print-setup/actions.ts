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

/** 저장본이 손상돼도 화면이 깨지지 않도록 좌표·크기가 유효한 박스만 통과시킨다. */
function sane(b: unknown): b is FormBoxDef {
  const o = b as Partial<FormBoxDef> | null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  return !!o && num(o.id) && num(o.x) && num(o.y) && num(o.w) && num(o.h)
    && (o.w as number) > 0 && (o.h as number) > 0 && typeof o.label === 'string'
}

export async function loadFormLayout(): Promise<{ layout: FormBoxDef[]; version: number } | null> {
  try {
    const r = await apiServer<{ version: number; layout: unknown }>(`/toolbox/forms/${FORM_NAME}`)
    if (!Array.isArray(r.layout)) return null
    const layout = r.layout.filter(sane)
    // 전부 손상됐으면 기본 배치로 — 빈 캔버스보다 복구 가능한 상태가 낫다
    return layout.length ? { layout, version: r.version } : null
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
