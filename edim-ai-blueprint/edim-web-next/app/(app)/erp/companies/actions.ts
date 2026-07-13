'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/companies'
export interface FormState { error?: string; ok?: string }

export async function addCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim()
  const companyType = String(formData.get('companyType') ?? 'SUPPLIER')
  const nation = String(formData.get('nation') ?? '').trim()
  if (!name) return { error: '업체명을 입력하십시오' }
  try {
    await apiServer('/companies', { method: 'POST', body: JSON.stringify({ name, companyType, nation }) })
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
