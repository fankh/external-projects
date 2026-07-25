'use server'

import { apiServer, ApiError } from '@/lib/api'

export interface WidgetAction { op: string; target: string; data: string }
export interface WidgetBind { table: string; column: string }
export interface Widget {
  id: string; kind: string; label: string; x: number; y: number; w: number; h: number
  /** U16 — Commend button set-up macro (동작·대상·Data, 슬라이드 27) */
  action?: WidgetAction
  /** U16 — Combo Data set-up (테이블 열 바인딩) */
  bind?: WidgetBind
}
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

/** U16 — Combo Data 바인딩 옵션 조회 (화이트리스트 distinct). */
export async function bindOptions(table: string, column: string): Promise<string[] | null> {
  try {
    const r = await apiServer<{ values: string[] }>(`/toolbox/bind-options?table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}`)
    return r.values
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** U16 잔여 — 위젯 '매크로' 동작 실행: 저장된 Macro 식을 실 Table 참조로 평가 (TBX-011). */
export interface MacroRunResult { ok: boolean; value?: number; error?: string }

export async function runWidgetMacro(macroName: string): Promise<MacroRunResult> {
  const name = macroName.trim()
  if (!name) return { ok: false, error: '매크로명이 지정되지 않았습니다' }
  try {
    // 저장된 Macro 의 수식을 가져와 평가 — 이름만으로 실행 가능하게 한다 (단건 GET 부재 → 목록에서 해석)
    const list = await apiServer<{ name: string; expr: string }[]>('/macros')
    const hit = list.find((m) => m.name === name)
    if (!hit) return { ok: false, error: `Macro 없음: ${name}` }
    const expr = (hit.expr ?? '').trim()
    if (!expr) return { ok: false, error: `Macro '${name}' 에 수식이 없습니다` }
    const r = await apiServer<{ value?: number; error?: string }>('/macros/evaluate', {
      method: 'POST', body: JSON.stringify({ formula: expr, variables: {} }),
    })
    if (r.error) return { ok: false, error: r.error }
    return { ok: true, value: r.value }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : '매크로 실행 실패' }
  }
}
