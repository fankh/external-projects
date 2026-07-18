'use server'

/** 부품 대장 뮤테이션 (N2) — 등록 + 공급자 코드 매핑(ERP-018). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/plm/parts'

export interface ActState { error?: string; ok?: string }

export async function createPart(_prev: ActState, formData: FormData): Promise<ActState> {
  const partNo = String(formData.get('partNo') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!partNo || !name) return { error: '부품번호·부품명은 필수입니다' }
  const weight = String(formData.get('weight') ?? '').trim()
  const body = {
    partNo, name,
    spec: String(formData.get('spec') ?? '').trim(),
    materialCode: String(formData.get('materialCode') ?? '').trim(),
    supplier: String(formData.get('supplier') ?? '').trim(),
    productCode: '',
    unit: String(formData.get('unit') ?? 'EA').trim() || 'EA',
    weight: weight ? Number(weight) : null,
    isStandard: formData.get('isStandard') === 'on',
  }
  try {
    await apiServer('/parts', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${partNo} 등록` }
}

export async function addSupplierCode(partNo: string, supplier: string, supplierCode: string, supplierName: string): Promise<ActState> {
  if (!supplier.trim() || !supplierCode.trim()) return { error: '공급처·공급자 코드는 필수입니다' }
  try {
    await apiServer(`/parts/${encodeURIComponent(partNo)}/supplier-codes`, {
      method: 'POST',
      body: JSON.stringify({ supplier: supplier.trim(), supplierCode: supplierCode.trim(), supplierName: supplierName.trim() }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '매핑 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${partNo} ← ${supplier} ${supplierCode}` }
}

/** U5 대체 자재 — 연결/해제. */
export async function addSubstitute(partNo: string, substituteNo: string, note: string): Promise<ActState> {
  if (!substituteNo.trim()) return { error: '대체 부품번호를 입력하십시오' }
  try {
    await apiServer(`/parts/${encodeURIComponent(partNo)}/substitutes`, {
      method: 'POST', body: JSON.stringify({ substituteNo: substituteNo.trim(), note: note.trim() }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '대체 자재 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${partNo} ⇄ ${substituteNo.trim()}` }
}

export async function deleteSubstitute(id: number): Promise<ActState> {
  try {
    await apiServer(`/parts/substitutes/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '해제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '대체 관계 해제' }
}
