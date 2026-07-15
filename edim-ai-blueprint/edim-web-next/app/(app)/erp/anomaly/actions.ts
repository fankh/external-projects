'use server'

/** 이상 이벤트 뮤테이션 (N3) — 스캔·에스컬레이션·상태전이 (OPEN→ACK→RESOLVED). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/anomaly'

export interface ActState { error?: string; ok?: string }

export async function scanAnomalies(): Promise<ActState> {
  try {
    const r = await apiServer<{ created: number }>('/anomalies/scan', { method: 'POST', body: '{}' })
    revalidatePath(PATH)
    return { ok: `스캔 완료 — 신규 ${r.created ?? 0}건` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '스캔 실패' }
  }
}

export async function escalateAnomalies(): Promise<ActState> {
  try {
    const r = await apiServer<{ escalated: number; admins: number }>('/anomalies/escalate', { method: 'POST', body: '{}' })
    revalidatePath(PATH)
    return { ok: `에스컬레이션 ${r.escalated}건 — 관리자 ${r.admins}명 통보` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '에스컬레이션 실패' }
  }
}

export async function setAnomalyStatus(anomalyId: number, status: 'ACK' | 'RESOLVED'): Promise<ActState> {
  try {
    await apiServer(`/anomalies/${anomalyId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '전이 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${anomalyId} → ${status === 'ACK' ? '확인' : '해소'}` }
}
