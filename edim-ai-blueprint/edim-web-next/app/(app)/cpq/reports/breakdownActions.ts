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
