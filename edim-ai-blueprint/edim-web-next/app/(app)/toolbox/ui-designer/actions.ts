'use server'

import { apiServer, ApiError } from '@/lib/api'

export interface Widget { id: string; kind: string; label: string; x: number; y: number; w: number; h: number }
export interface AiUiResult { mode: 'live' | 'sample' | 'error'; widgets: { kind: string; label: string; x: number; y: number; w: number; h: number }[]; notes: string; error?: string }

/** layout_def 저장 — version+1 (tbx_ui_form). */
export async function saveLayout(name: string, layout: Widget[]): Promise<{ version: number } | null> {
  try {
    return await apiServer<{ version: number }>(`/toolbox/forms/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ layout }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 게시 승인 요청 (TBX-004). */
export async function publishForm(name: string, version: number): Promise<boolean> {
  try {
    await apiServer('/approvals', { method: 'POST', body: JSON.stringify({ targetTable: 'tbx_ui_form', targetId: 0, requestType: 'UPDATE', label: `UI Form 게시 — ${name} v${version} layout_def`, targetCode: name }) })
    return true
  } catch (e) {
    if (e instanceof ApiError) return false
    throw e
  }
}

/** AI UI 초안 제안 (Claude, 키 없으면 sample). */
export async function aiSuggest(description: string): Promise<AiUiResult | null> {
  try {
    return await apiServer<AiUiResult>('/ai/ui-suggest', { method: 'POST', body: JSON.stringify({ description }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}
