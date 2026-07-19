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

/** 부품 수정 (F5 이식) — 부품명·사양·재질·공급처·단위·중량 (PUT /parts/{partNo}, 폼 액션). */
export async function updatePart(_prev: ActState, formData: FormData): Promise<ActState> {
  const partNo = String(formData.get('partNo') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!partNo) return { error: '수정 대상이 없습니다' }
  if (!name) return { error: '부품명은 필수입니다' }
  const weight = String(formData.get('weight') ?? '').trim()
  const body = {
    name,
    spec: String(formData.get('spec') ?? '').trim(),
    materialCode: String(formData.get('materialCode') ?? '').trim(),
    supplier: String(formData.get('supplier') ?? '').trim(),
    unit: String(formData.get('unit') ?? 'EA').trim() || 'EA',
    weight: weight ? Number(weight) : null,
  }
  try {
    await apiServer(`/parts/${encodeURIComponent(partNo)}`, { method: 'PUT', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패 (미등록 재질 422 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `부품 수정 ✓ — ${partNo}` }
}

/** 부품 대량 등록 (Excel) — /parts/import-excel (거래처 Import 와 동일 패턴). */
export async function importPartsExcel(_prev: ActState, formData: FormData): Promise<ActState> {
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: 'Excel 파일을 선택하십시오' }
  const { getToken } = await import('@/lib/session')
  const token = await getToken()
  const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/parts/import-excel`, {
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

export async function deletePart(partNo: string): Promise<ActState> {
  try {
    await apiServer(`/parts/${encodeURIComponent(partNo)}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (BOM 참조 보호 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `부품 삭제 ✓ — ${partNo}` }
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
