'use server'

import { apiServer, ApiError } from '@/lib/api'
import type { CadDocument, DimensionDef, MacroResult } from '@/lib/cadTypes'
import type { CadEditOp } from '@/components/CadSvg'

/** Macro 식 평가 (ENG-01) — Excel 호환 문법, Table 참조는 실 tbl_data_row. */
export async function evaluateMacro(formula: string, variables: Record<string, number>): Promise<MacroResult | null> {
  try {
    return await apiServer<MacroResult>('/macros/evaluate', { method: 'POST', body: JSON.stringify({ formula, variables }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 부품도 작도 — 서버 DXF 작도→파싱 문서 (Run 제작도면과 동일 정본). */
export async function cadPartDrawing(dims: Record<string, number>): Promise<CadDocument | null> {
  try {
    const r = await apiServer<{ document: CadDocument }>('/cad/part-drawing', { method: 'POST', body: JSON.stringify({ dims }) })
    return r.document
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 부품도를 dwg_file 로 실체화(편집 대상 fileId 반환). */
export async function cadPartDrawingSave(dims: Record<string, number>, name = 'part_edit.dxf'): Promise<{ fileId: number; document: CadDocument } | null> {
  try {
    return await apiServer<{ fileId: number; document: CadDocument }>('/cad/part-drawing/save', { method: 'POST', body: JSON.stringify({ dims, name }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 엔티티 편집(이동/삭제/복사/회전/미러/추가/자르기) → DXF 재저장 후 재파싱. */
export async function cadEdit(fileId: number, ops: CadEditOp[]): Promise<{ applied: number; document: CadDocument }> {
  return apiServer<{ applied: number; document: CadDocument }>(`/cad/view/${fileId}/edit`, { method: 'POST', body: JSON.stringify({ ops }) })
}

/** 서버 정본 재조회 (편집 실패 복원용). */
export async function cadView(fileId: number): Promise<CadDocument | null> {
  try {
    const r = await apiServer<{ document: CadDocument }>(`/cad/view/${fileId}`)
    return r.document
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** F12 임시저장 — dwg_dimension/tbx_macro. */
export async function saveDimensions(dims: DimensionDef[], drawing = 'KDCR 3-13'): Promise<{ variantSaved: number; macroSaved: number } | null> {
  try {
    return await apiServer<{ variantSaved: number; macroSaved: number }>('/drawings/dimensions', { method: 'PUT', body: JSON.stringify({ drawing, dims }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}

/** 설계 변경 승인 요청. */
export async function requestApproval(label: string): Promise<boolean> {
  try {
    await apiServer('/approvals', { method: 'POST', body: JSON.stringify({ targetTable: 'dwg_drawing', targetId: 0, requestType: 'UPDATE', label, targetCode: 'KDCR 3-13' }) })
    return true
  } catch (e) {
    if (e instanceof ApiError) return false
    throw e
  }
}
