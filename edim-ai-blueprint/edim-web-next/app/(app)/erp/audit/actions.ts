'use server'

/** 감사 조회 서버 액션 (P2) — sys_history 기간/사용자/작업/대상 필터 (ADMIN). */
import { apiServer, ApiError } from '@/lib/api'
import type { AuditRow } from './AuditGrid'

export interface AuditFilter { fromDate?: string; toDate?: string; user?: string; action?: string; target?: string; limit?: number }
export interface AuditData { rows: AuditRow[]; actions: string[]; users: string[]; count: number }

function auditQs(f: AuditFilter): string {
  const qs = new URLSearchParams()
  if (f.fromDate) qs.set('fromDate', f.fromDate)
  if (f.toDate) qs.set('toDate', f.toDate)
  if (f.user) qs.set('user', f.user)
  if (f.action) qs.set('action', f.action)
  if (f.target) qs.set('target', f.target)
  if (f.limit) qs.set('limit', String(f.limit))
  return qs.toString()
}

export async function queryAudit(f: AuditFilter): Promise<{ data?: AuditData; error?: string }> {
  try {
    const qs = auditQs({ ...f, limit: f.limit ?? 500 })
    return { data: await apiServer<AuditData>(`/audit${qs ? `?${qs}` : ''}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '조회 실패' }
  }
}
