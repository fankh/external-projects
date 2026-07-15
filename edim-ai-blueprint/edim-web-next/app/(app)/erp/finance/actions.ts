'use server'

/** 다통화·세금 마스터 뮤테이션 (N3) — 환율/세금코드 등록·삭제 + 세금엔진 계산. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/finance'

export interface ActState { error?: string; ok?: string }
export interface QuoteCalc {
  currency: string; rate: number; taxPct: number; amount: number
  taxAmount: number; total: number; baseAmount: number; baseTax: number
  baseTotal: number; baseCurrency: string
}

export async function addFx(currency: string, rate: number, validFrom: string): Promise<ActState> {
  if (!currency.trim() || !rate) return { error: '통화·환율은 필수입니다' }
  try {
    await apiServer('/finance/fx', { method: 'POST', body: JSON.stringify({ currency: currency.trim().toUpperCase(), rate, validFrom }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '환율 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${currency.toUpperCase()} = ₩${rate.toLocaleString()}` }
}

export async function removeFx(id: number): Promise<ActState> {
  try {
    await apiServer(`/finance/fx/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '환율 삭제' }
}

export async function addTax(code: string, name: string, ratePct: number): Promise<ActState> {
  if (!code.trim() || !name.trim()) return { error: '코드·세금명은 필수입니다' }
  try {
    await apiServer('/finance/tax-codes', { method: 'POST', body: JSON.stringify({ code: code.trim(), name: name.trim(), ratePct }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '세금코드 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${code} (${ratePct}%) 등록` }
}

export async function removeTax(id: number): Promise<ActState> {
  try {
    await apiServer(`/finance/tax-codes/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패' }
  }
  revalidatePath(PATH)
  return { ok: '세금코드 삭제' }
}

export async function quoteCalc(currency: string, amount: number, taxCode: string): Promise<{ result?: QuoteCalc; error?: string }> {
  try {
    const result = await apiServer<QuoteCalc>('/finance/quote-calc', {
      method: 'POST', body: JSON.stringify({ currency, amount, taxCode }),
    })
    return { result }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '계산 실패' }
  }
}
