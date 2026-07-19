'use server'

/** Macro Studio 뮤테이션 (N5b) — 저장(DRAFT upsert)·Test Run(평가)·삭제·승인 요청. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/toolbox/macros'

export interface ActState { error?: string; ok?: string }
export interface EvalResult { ok: boolean; value?: number | string; error?: string; trace?: string[] }

export async function saveMacro(name: string, expr: string, prompt: string): Promise<ActState> {
  if (!name.trim() || !expr.trim()) return { error: '이름·식은 필수입니다' }
  try {
    const r = await apiServer<{ version: number; refs: number }>(`/macros/${encodeURIComponent(name.trim())}`, {
      method: 'PUT', body: JSON.stringify({ prompt, expr }),
    })
    revalidatePath(PATH)
    return { ok: `${name} 저장 — v${r.version} (DRAFT${r.refs ? ` · 참조 ${r.refs}` : ''})` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}

export async function evaluateMacro(formula: string, variables: Record<string, number>): Promise<EvalResult> {
  try {
    return await apiServer<EvalResult>('/macros/evaluate', {
      method: 'POST', body: JSON.stringify({ formula, variables }),
    })
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : '평가 실패' }
  }
}

export async function deleteMacro(name: string): Promise<ActState> {
  try {
    await apiServer(`/macros/${encodeURIComponent(name)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (참조 보호 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${name} 삭제` }
}

export async function requestMacroApproval(name: string): Promise<ActState> {
  try {
    await apiServer('/approvals', {
      method: 'POST',
      body: JSON.stringify({ targetTable: 'tbx_macro', targetCode: name, requestType: 'UPDATE', label: `Macro ${name}` }),
    })
    revalidatePath(PATH)
    return { ok: `${name} 승인 요청` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}

export interface MacroFn { name: string; sig: string; desc: string; keywords: string }

/** U24 — 함수 마법사 카탈로그 (자연어 검색, TBX-014). */
/** B20 — Macro 역참조 (tbx_macro_ref: TABLE/VAR/MACRO 의존). */
export async function getMacroRefs(name: string): Promise<{ refType: string; target: string }[]> {
  try {
    return await apiServer<{ refType: string; target: string }[]>(`/macros/${encodeURIComponent(name)}/refs`)
  } catch { return [] }
}

export async function getMacroFunctions(q: string): Promise<MacroFn[]> {
  try {
    return await apiServer<MacroFn[]>(`/macros/functions?q=${encodeURIComponent(q)}`)
  } catch { return [] }
}

/** U7 (AI-04) — Prompt→Macro 생성: 키·크레딧 준비 시 live, 아니면 sample/error 폴백. */
export interface AiMacroResult { mode: 'live' | 'sample' | 'error'; formula: string; description: string; coding: string; error?: string }

export async function aiGenerateMacro(prompt: string): Promise<AiMacroResult | null> {
  try {
    return await apiServer<AiMacroResult>('/ai/macro-generate', {
      method: 'POST', body: JSON.stringify({ prompt }),
    })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}
