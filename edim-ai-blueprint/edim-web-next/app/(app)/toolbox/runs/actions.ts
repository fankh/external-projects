'use server'

/** Run 이력 관리 뮤테이션 (N5b) — Run 정리·보관 정리·MinIO GC. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/toolbox/runs'

export interface ActState { error?: string; ok?: string }

export async function deleteRun(runId: number): Promise<ActState> {
  try {
    await apiServer(`/cpq/runs/${runId}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Run 삭제 실패 (보호 규칙 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `Run #${runId} 정리` }
}

export async function cleanupRuns(keepLatest: number): Promise<ActState> {
  try {
    const r = await apiServer<{ removed: number; kept: number }>('/cpq/runs/cleanup', {
      method: 'POST', body: JSON.stringify({ keepLatest }),
    })
    revalidatePath(PATH)
    return { ok: `보관 정리 — 삭제 ${r.removed} · 유지 ${r.kept}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '보관 정리 실패' }
  }
}

export async function gcStorage(apply: boolean): Promise<ActState> {
  try {
    const r = await apiServer<{ candidates?: number; removed?: number; freedBytes?: number }>('/files/gc', {
      method: 'POST', body: JSON.stringify({ apply }),
    })
    revalidatePath(PATH)
    return {
      ok: apply
        ? `MinIO GC — 삭제 ${r.removed ?? 0}개 (${Math.round((r.freedBytes ?? 0) / 1024)} KB)`
        : `GC 미리보기 — 후보 ${r.candidates ?? r.removed ?? 0}개 (적용 전)`,
    }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'GC 실패' }
  }
}
