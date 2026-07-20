'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const PATH = '/erp/companies'
const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'
export interface FormState { error?: string; ok?: string }

export async function addCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim()
  const companyType = String(formData.get('companyType') ?? 'SUPPLIER')
  const nation = String(formData.get('nation') ?? '').trim()
  const grade = String(formData.get('grade') ?? '').trim()
  const terms = String(formData.get('terms') ?? '').trim()
  if (!name) return { error: '업체명을 입력하십시오' }
  try {
    await apiServer('/companies', { method: 'POST', body: JSON.stringify({ name, companyType, nation, grade, terms }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${name} 등록` }
}

export async function toggleCompanyActive(companyId: number, active: boolean): Promise<FormState> {
  try {
    await apiServer(`/companies/${companyId}`, { method: 'PUT', body: JSON.stringify({ active }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '변경 실패' }
  }
  revalidatePath(PATH)
  return { ok: active ? '재활성' : '비활성' }
}

/** 일괄 활성/비활성 (POST /companies/batch) — 다중 선택 소프트 토글, 최대 200건. */
export async function batchCompanyActive(ids: number[], active: boolean): Promise<FormState> {
  if (!ids.length) return { error: '대상을 선택하십시오' }
  try {
    const r = await apiServer<{ done: number; requested: number }>(
      '/companies/batch', { method: 'POST', body: JSON.stringify({ ids, active }) })
    revalidatePath(PATH)
    return { ok: `일괄 ${active ? '활성' : '비활성'} ✓ — ${r.done}/${r.requested}건` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '일괄 변경 실패' }
  }
}

/** 거래처 수정 (F5 이식) — 평가등급·결제조건 (PUT /companies/{id}, 폼 액션). */
export async function updateCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const companyId = Number(formData.get('companyId'))
  const name = String(formData.get('name') ?? '')
  if (!companyId) return { error: '수정 대상이 없습니다' }
  const body = {
    grade: String(formData.get('grade') ?? '').trim(),
    terms: String(formData.get('terms') ?? '').trim(),
  }
  try {
    await apiServer(`/companies/${companyId}`, { method: 'PUT', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패 (중복명 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `업체 수정 ✓ — ${name}` }
}

/** 거래처 대량 등록 (Excel) — 헤더: 업체명·유형·국가·결제조건. */
export async function importCompaniesExcel(_prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: 'Excel 파일을 선택하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/companies/import-excel`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as { inserted: number; rejected: string[] }
  revalidatePath(PATH)
  return { ok: `Import — 등록 ${r.inserted}건${r.rejected?.length ? ` · 거부 ${r.rejected.length}` : ''}` }
}

/** 공급처 평가 등록/갱신 — delivery·quality·price(각 0~100) → 총점·등급. */
export async function addSupplierEval(supplierId: number, period: string, delivery: number, quality: number, price: number, note: string): Promise<FormState> {
  if (!period.trim()) return { error: '평가 기간(예: 2026-H1)을 입력하십시오' }
  try {
    const r = await apiServer<{ evalId: number; total: number; grade: string }>('/erp/suppliers/evals', {
      method: 'POST', body: JSON.stringify({ supplierId, period: period.trim(), delivery, quality, price, note }),
    })
    revalidatePath(PATH)
    return { ok: `평가 저장 — 총점 ${r.total} · 등급 ${r.grade}` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '평가 저장 실패' }
  }
}
