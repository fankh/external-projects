'use server'

/** 창고·저장위치 뮤테이션 (N3) — 계층 등록·삭제 (REGION→PLANT→WAREHOUSE→STORAGE→SECTOR 강제). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/warehouses'

export interface ActState { error?: string; ok?: string }

export async function createWarehouse(_prev: ActState, formData: FormData): Promise<ActState> {
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!code || !name) return { error: '위치 코드·이름은 필수입니다' }
  const body = {
    parentCode: String(formData.get('parentCode') ?? '').trim(),
    locationType: String(formData.get('locationType') ?? 'REGION').trim(),
    code, name,
    hazard: String(formData.get('hazard') ?? '').trim(),
    inspection: String(formData.get('inspection') ?? '').trim(),
    remarks: String(formData.get('remarks') ?? '').trim(),
  }
  try {
    await apiServer('/erp/warehouses', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${code} 등록` }
}

export async function deleteWarehouse(code: string): Promise<ActState> {
  try {
    await apiServer(`/erp/warehouses/${encodeURIComponent(code)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (하위 위치 보호 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${code} 삭제` }
}

/** U5 창고 정기점검 실적. */
export interface InspectionRow { id: number; result: 'OK' | 'ISSUE'; note: string; by: string; at: string }

export async function listInspections(code: string): Promise<InspectionRow[]> {
  try {
    return await apiServer<InspectionRow[]>(`/erp/warehouses/${encodeURIComponent(code)}/inspections`)
  } catch { return [] }
}

export async function addInspection(code: string, result: string, note: string): Promise<ActState> {
  try {
    await apiServer(`/erp/warehouses/${encodeURIComponent(code)}/inspections`, {
      method: 'POST', body: JSON.stringify({ result, note }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '점검 등록 실패' }
  }
  return { ok: `${code} 점검 기록 (${result})` }
}
