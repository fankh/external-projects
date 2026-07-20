'use server'

/** 1.3 — 고객사(테넌트) 프로비저닝 뮤테이션 (플랫폼 운영 전용). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/tenants'

export interface ActState { error?: string; ok?: string }

export async function createTenant(_prev: ActState, formData: FormData): Promise<ActState> {
  const body = {
    tenantCode: String(formData.get('tenantCode') ?? '').trim(),
    tenantName: String(formData.get('tenantName') ?? '').trim(),
    plan: String(formData.get('plan') ?? 'SAAS').trim(),
    adminLogin: String(formData.get('adminLogin') ?? '').trim(),
    adminName: String(formData.get('adminName') ?? '').trim(),
    adminPassword: String(formData.get('adminPassword') ?? '').trim(),
  }
  if (!body.tenantCode || !body.tenantName || !body.adminLogin) {
    return { error: '고객사 코드·이름·관리자 사번은 필수입니다' }
  }
  try {
    const r = await apiServer<{ tenantCode: string; seededNodes: number }>('/platform/tenants', {
      method: 'POST', body: JSON.stringify(body),
    })
    revalidatePath(PATH)
    return { ok: `${r.tenantCode} 생성 ✓ — 관리자 ${body.adminLogin} · 기본 노드 ${r.seededNodes}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '고객사 생성 실패' }
  }
}

export async function setTenantStatus(code: string, status: string): Promise<ActState> {
  try {
    await apiServer(`/platform/tenants/${encodeURIComponent(code)}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
    revalidatePath(PATH)
    return { ok: `${code} → ${status}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '상태 변경 실패' }
  }
}
