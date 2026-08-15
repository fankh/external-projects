/** 유지보수 계약 관리 현황(§03 유지보수 계약: 대상 자산·SLA·비용 이력) — 계약별 예산 집행률과 SLA 요약을
 *  한 곳에 모은다. 그동안 비용 이력은 '누계'만 보였고 계약액 대비 집행률·잔여 예산·판정이 없었다.
 *  읽기 전용 합성 뷰 — 화면과 대장이 같은 산출을 쓴다(계약 amount·costs·연계 자산에서 결정적으로 파생). */
import { getStore } from './store'

export interface MaintenanceRow {
  id: string
  name: string
  vendor: string
  end: string
  amount: number
  spent: number
  /** 집행률(%) — 누계 지출 ÷ 계약액 */
  rate: number
  remaining: number
  /** 연계 자산 수(대장 실측 — asset.contractId 기준) */
  covered: number
  sla?: string
  costCount: number
  /** 판정 — 예산 초과(>100%) · 소진 임박(≥90%) · 미집행(0%) · 정상 */
  status: '예산 초과' | '소진 임박' | '미집행' | '정상'
}

export function buildMaintenance(): {
  rows: MaintenanceRow[]
  totalAmount: number
  totalSpent: number
  overBudget: number
  noSla: number
} {
  const s = getStore()
  const rows: MaintenanceRow[] = s.contracts
    .filter((c) => c.kind === '유지보수' && c.status !== '해지')
    .map((c) => {
      const spent = (c.costs ?? []).reduce((n, x) => n + x.amount, 0)
      const rate = c.amount > 0 ? Math.round((spent / c.amount) * 100) : 0
      const status: MaintenanceRow['status'] = rate > 100 ? '예산 초과' : rate === 0 ? '미집행' : rate >= 90 ? '소진 임박' : '정상'
      return {
        id: c.id,
        name: c.name,
        vendor: c.vendor,
        end: c.end,
        amount: c.amount,
        spent,
        rate,
        remaining: c.amount - spent,
        covered: s.assets.filter((a) => a.contractId === c.id).length,
        sla: c.sla,
        costCount: c.costs?.length ?? 0,
        status,
      }
    })
    .sort((a, b) => b.rate - a.rate)
  return {
    rows,
    totalAmount: rows.reduce((n, r) => n + r.amount, 0),
    totalSpent: rows.reduce((n, r) => n + r.spent, 0),
    overBudget: rows.filter((r) => r.status === '예산 초과').length,
    noSla: rows.filter((r) => !r.sla).length,
  }
}
