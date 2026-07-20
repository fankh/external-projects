'use server'

/** ERP Handoff 뮤테이션 (트리아지 #44~47) — 생성(Validation)·수신(accept). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface ActState { error?: string; ok?: string }
export interface HandoffRow {
  handoffId: number; projectNo: string; runId: number; version: number
  status: string; grade: string | null; checks: { check: string; grade: string; detail: string }[]
  createdAt: string; createdBy: string; acceptedAt: string | null
}
export interface RunOption { runId: number; startedAt: string }

export async function createHandoff(runId: number): Promise<ActState> {
  try {
    const r = await apiServer<{ handoffId: number; version: number; grade: string }>(
      '/erp/handoffs', { method: 'POST', body: JSON.stringify({ runId }) })
    revalidatePath('/erp/sales-order')
    return { ok: `Handoff #${r.handoffId} v${r.version} 생성 (${r.grade}) — 승인함 결정 대기` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Handoff 생성 실패' }
  }
}

export async function acceptHandoff(handoffId: number): Promise<ActState> {
  try {
    await apiServer(`/erp/handoffs/${handoffId}/accept`, { method: 'POST' })
    revalidatePath('/erp/sales-order')
    return { ok: `Handoff #${handoffId} ERP 수신 ✓ — 프로젝트 업무 시작` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수신 실패 (승인 필요 409)' }
  }
}
