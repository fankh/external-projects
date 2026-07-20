'use server'

/** U19 PCR 비용 트리 조회. */
import { apiServer } from '@/lib/api'

export interface PcrBreakdown {
  pcrId: number; businessType: string; revenue: number
  sections: { title: string; rows: { name: string; amount: number }[]; subtotal: number }[]
  directCostTotal: number; contributionMargin: number
  sga: { rows: { name: string; amount: number }[]; subtotal: number; basis: string }
  fullCosts: number; ebit: number
}

export async function getPcrBreakdown(pcrId: number): Promise<PcrBreakdown | null> {
  try {
    return await apiServer<PcrBreakdown>(`/cost/pcr/${pcrId}/breakdown`)
  } catch { return null }
}

/** D6 — 실적 반영 PCR 재계산 (GET /cost/pcr/{id}/actual): 직접비를 cst_actual 로 치환해 추정 대비 차이 산출. */
export interface PcrActual {
  pcrId: number; projectNo: string; revenue: number; sga: number
  actualAvailable: boolean; actualCount: number
  estimate: { directCost: number; margin: number; ebit: number; marginPct: number }
  actual: { directCost: number; margin: number; ebit: number; marginPct: number }
  variance: { directCost: number; margin: number; ebit: number }
}

export async function getPcrActual(pcrId: number): Promise<PcrActual | null> {
  try {
    return await apiServer<PcrActual>(`/cost/pcr/${pcrId}/actual`)
  } catch { return null }
}
