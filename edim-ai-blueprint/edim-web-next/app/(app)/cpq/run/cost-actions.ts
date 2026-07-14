'use server'

import { apiServer, ApiError } from '@/lib/api'

export interface RunCostRow { calcType: 'MATERIAL' | 'MANUFACTURING' | 'DIRECT'; lines: Record<string, unknown>[]; total: number }
export interface PcrResult { pcrId: number; businessType: string; revenue: number; directCostTotal: number; contributionMargin: number; ebit: number }
export interface QuotationRow { quotationId: number; quotationNo: string; total: number; currency: string; status: string; date: string; project: string; customer: string; taxCode?: string; taxPct?: number; subtotal?: number; tax?: number }
export interface FxRow { fxId: number; currency: string; rate: number; validFrom: string }
export interface TaxCodeRow { taxId: number; code: string; name: string; ratePct: number }

/** B18 CostPanel 초기 데이터 — 원가·견적목록·통화·세금코드 병렬. */
export async function loadCostPanel(runId: number): Promise<{ costs: RunCostRow[]; quotes: QuotationRow[]; fx: FxRow[]; taxCodes: TaxCodeRow[] }> {
  const [costs, quotes, fx, taxCodes] = await Promise.all([
    apiServer<RunCostRow[]>(`/cpq/runs/${runId}/costs`).catch(() => []),
    apiServer<QuotationRow[]>('/cost/quotations').catch(() => []),
    apiServer<FxRow[]>('/finance/fx').catch(() => []),
    apiServer<TaxCodeRow[]>('/finance/tax-codes').catch(() => []),
  ])
  return { costs, quotes, fx, taxCodes }
}

/** PCR upsert (수익성). */
export async function createPcr(businessType: string, marginRate = 0.35): Promise<{ pcr?: PcrResult; error?: string }> {
  try {
    return { pcr: await apiServer<PcrResult>('/cost/pcr', { method: 'POST', body: JSON.stringify({ businessType, marginRate }) }) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'PCR 생성 실패' }
  }
}

/** 견적 확정 (통화·세금코드 → 세액 자동적재, PCR 필요 시 409). */
export async function createQuotation(businessType: string, currency = 'KRW', taxCode = ''): Promise<{ result?: { quotationNo: string; currency: string; subtotal: number; taxPct: number; tax: number; total: number }; quotes?: QuotationRow[]; error?: string }> {
  try {
    const result = await apiServer<{ quotationNo: string; currency: string; subtotal: number; taxPct: number; tax: number; total: number }>('/cost/quotations', { method: 'POST', body: JSON.stringify({ businessType, currency, taxCode }) })
    const quotes = await apiServer<QuotationRow[]>('/cost/quotations').catch(() => [])
    return { result, quotes }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '견적 확정 실패' }
  }
}
