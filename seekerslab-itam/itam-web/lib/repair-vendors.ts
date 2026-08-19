/** 수리 업체 성과 스코어카드 — 자산 단위 수리 이력(repairCosts)·진행 중 수리(repair)를 업체별로 집계한다.
 *  누가 우리 수리를 얼마나·얼마에 처리하는지, 지금 예상 반환을 넘긴 건이 어느 업체에 몰렸는지 한눈에 본다
 *  (유지보수 계약 관리의 자산 단위 짝 — 업체 책임성·재계약 협상 근거). 읽기 전용 합성 뷰. */
import { isRepairOverdue } from './dates'
import { getStore } from './store'

export interface RepairVendorRow {
  vendor: string
  /** 완료 수리 건수(repairCosts 항목 수) */
  completed: number
  /** 자사 부담 누계 — 무상 보증 청구분(제조사 부담)은 제외 */
  selfBorne: number
  /** 자사 부담 평균 — 자사 부담 완료 건 기준(무상 청구 건 제외). 부담 건이 없으면 0 */
  avgSelfBorne: number
  /** 무상 보증 청구 건수 */
  warrantyClaims: number
  /** 보증 절감 누계(무상 청구로 회피한 수리비) */
  warrantySaved: number
  /** 현재 진행 중 수리(수리중·repair 배정) 건수 */
  inFlight: number
  /** 진행 중 수리 가운데 예상 반환일 경과(업체 지연) 건수 */
  overdue: number
  /** SLA 판정 건수 — 예상 반환일(eta)이 있어 정시/지연을 판정할 수 있었던 완료 건(정시율 분모) */
  slaCount: number
  /** 그 중 정시 반환(eta 이내) 건수 */
  onTimeCount: number
  /** 정시 반환율(%) — onTimeCount ÷ slaCount. 판정 건이 없으면 null(집계 불가) */
  onTimePct: number | null
}

export function buildRepairVendors(): RepairVendorRow[] {
  const s = getStore()
  const m = new Map<string, RepairVendorRow>()
  const row = (v: string) => {
    let r = m.get(v)
    if (!r) { r = { vendor: v, completed: 0, selfBorne: 0, avgSelfBorne: 0, warrantyClaims: 0, warrantySaved: 0, inFlight: 0, overdue: 0, slaCount: 0, onTimeCount: 0, onTimePct: null }; m.set(v, r) }
    return r
  }
  for (const a of s.assets) {
    for (const c of a.repairCosts ?? []) {
      if (!c.vendor || c.vendor === '-') continue
      const r = row(c.vendor)
      r.completed += 1
      if (c.warrantyClaimed) { r.warrantyClaims += 1; r.warrantySaved += c.amount }
      else r.selfBorne += c.amount
      if (c.onTime !== undefined) { r.slaCount += 1; if (c.onTime) r.onTimeCount += 1 }
    }
    if (a.status === '수리중' && a.repair?.vendor) {
      const r = row(a.repair.vendor)
      r.inFlight += 1
      if (isRepairOverdue(a)) r.overdue += 1
    }
  }
  for (const r of m.values()) {
    // 자사 부담 완료 건수(무상 청구 제외)로 평균을 낸다 — 무상 청구는 자사 지출이 아니므로 평균 왜곡 방지
    const paidCount = r.completed - r.warrantyClaims
    r.avgSelfBorne = paidCount > 0 ? Math.round(r.selfBorne / paidCount) : 0
    r.onTimePct = r.slaCount > 0 ? Math.round((r.onTimeCount / r.slaCount) * 100) : null
  }
  // 활동량(완료 + 진행) 내림차순 → 자사 부담 누계 내림차순
  return [...m.values()].sort((a, b) => (b.completed + b.inFlight) - (a.completed + a.inFlight) || b.selfBorne - a.selfBorne)
}
