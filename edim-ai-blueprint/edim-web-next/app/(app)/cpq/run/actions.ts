'use server'

import { apiServer } from '@/lib/api'

export interface RunStep { no: number; task: string; measured: string; elapsed: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'WARN' }
export interface RunOutput { folder: string; file: string; fileType: string; status: string; statusTone: 'ok' | 'warn' | 'info'; nextAction?: string; fileId?: number | null }
export interface RunLogEntry { time: string; message: string; level: 'info' | 'warn' }
export interface RunResult { runId: number; status: string; progress: number; steps: RunStep[]; outputs: RunOutput[]; logs: RunLogEntry[] }

/** 파이프라인 시작 — 202 Accepted, 백그라운드 태스크 생성. runId 반환. */
export async function startRun(selectionId?: number): Promise<{ runId: number; status: string }> {
  const body: Record<string, unknown> = { runType: 'ALL' }
  if (typeof selectionId === 'number') body.selectionId = selectionId
  const r = await apiServer<{ runId: number; status: string }>('/cpq/runs', {
    method: 'POST', body: JSON.stringify(body),
  })
  return { runId: r.runId, status: r.status }
}

/** 진행 상태 폴링 — status !== 'RUNNING' 이면 완료(SUCCESS/FAILED). */
export async function pollRun(runId: number): Promise<RunResult> {
  return apiServer<RunResult>(`/cpq/runs/${runId}`)
}
