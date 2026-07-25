'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

/** MAKE/BUY + 공정 파라미터 저장 (U3 — 작업장·인원·Skill·W.Time·창고·재고·비고). */
export async function saveMakeBuy(
  code: string,
  items: { item: string; makeOrBuy: string; workshop?: string; warehouse?: string; minStock?: number; person?: number | null; skill?: string; timeMin?: number | null; remarks?: string }[],
): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/erp/work-process', { method: 'PUT', body: JSON.stringify({ code, items }) })
    revalidatePath('/plm/work-process')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}

/** U17 설계 파라미터 (설계/자료 우선순위·기준점·오류체크). */
export interface DesignParamRow {
  no: string; kind: string; designPriority: number | null; dataPriority: number | null
  basePoint: string; errorCheck: string; remarks: string
}

/** U17 잔여 — 오류조건 판정 결과 (Design Editor·Run 경고 연동). */
export interface ErrorCheckItem { no: string; rule: string; detail: string; value: number | null }
export interface ErrorCheckResult {
  drawing: string; found: boolean; checked: number; ok: boolean
  violations: ErrorCheckItem[]; unevaluated: ErrorCheckItem[]
}

export async function runErrorCheck(code: string): Promise<{ result?: ErrorCheckResult; error?: string }> {
  try {
    return { result: await apiServer<ErrorCheckResult>(`/drawings/dimensions/error-check?drawing=${encodeURIComponent(code)}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '오류조건 점검 실패' }
  }
}

export async function saveDesignParams(code: string, items: DesignParamRow[]): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/drawings/dimensions/design-params', {
      method: 'PUT',
      body: JSON.stringify({ drawing: code, items: items.map((r) => ({
        no: r.no, designPriority: r.designPriority, dataPriority: r.dataPriority,
        basePoint: r.basePoint ?? '', errorCheck: r.errorCheck ?? '', remarks: r.remarks ?? '',
      })) }),
    })
    revalidatePath('/plm/work-process')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '저장 실패' }
  }
}
