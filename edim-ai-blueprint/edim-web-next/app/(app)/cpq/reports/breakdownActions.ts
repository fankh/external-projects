'use server'

/** U19 PCR 비용 트리 조회. */
import { apiServer } from '@/lib/api'

export interface PcrBreakdown {
  pcrId: number; businessType: string; revenue: number
  sections: { title: string; rows: { name: string; amount: number }[]; subtotal: number }[]
  directCostTotal: number; contributionMargin: number
  sga: { rows: { name: string; amount: number }[]; subtotal: number; basis: string }
  fullCosts: number; ebit: number
  /** 근거 완전성 — 단가 미해결 품목은 0 원으로 집계되므로 금액이 실제보다 낮다. */
  unpricedCount?: number; unpricedCodes?: string[]; basisComplete?: boolean
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

/** U19 잔여 — 사업유형 다열 비교 (슬라이드 74 'Own acc./Biz.Type n' 열). */
export interface PcrCompare {
  columns: { businessType: string; pcrId: number; code: string; marginRate: number | null
             unpricedCount?: number; basisComplete?: boolean }[]
  metrics: { key: string; label: string; cells: (number | string | null)[]; delta: number | null }[]
  maskMode: string; note: string; noteCode?: 'latestPerType' | 'noPcr'
  basisComplete?: boolean; incompleteBasisTypes?: string[]
}

export async function getPcrCompare(): Promise<PcrCompare | null> {
  try {
    return await apiServer<PcrCompare>('/cost/pcr/compare')
  } catch { return null }
}
