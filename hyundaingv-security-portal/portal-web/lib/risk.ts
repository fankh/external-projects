/** 정보보호 위험평가 단일 원천 — 위험도(=발생가능성×영향도)·등급·KPI 를 화면·export·컴플라이언스 종합이
 *  같은 술어로 공유한다(fixRate·finance 처럼 값이 아니라 '경계 처리'까지 단일화). 위험도·등급은 저장하지
 *  않고 여기서 파생한다(L·I 만 저장 → 재평가 시 한 곳만 바뀜). */
import { nowStamp, today } from './dates'
import { nextNo } from './store'
import type { Store } from './store'
import type { RiskItem, RiskSnapshot } from './types'

/** 위험도 점수 = 발생가능성 × 영향도 (1~25). 5×5 매트릭스. 손상 데이터(비수치·범위 밖)는 0~5 로 클램프해
 *  NaN·과대 점수가 등급·KPI 로 새지 않게 한다(스토어 정규화가 숫자 강제하나 방어적 이중화). */
export function riskScore(r: { likelihood: number; impact: number }): number {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0)
  return clamp(r.likelihood) * clamp(r.impact)
}

export interface RiskTier {
  label: '낮음' | '보통' | '높음' | '심각'
  tone: 'ok' | 'neutral' | 'warn' | 'err'
}

/** 위험도 등급 — 5×5 매트릭스 구간. 심각(≥15)·높음(≥10)·보통(≥5)·낮음(<5). 화면 히트맵·목록·export 공유. */
export function riskTier(score: number): RiskTier {
  if (score >= 15) return { label: '심각', tone: 'err' }
  if (score >= 10) return { label: '높음', tone: 'warn' }
  if (score >= 5) return { label: '보통', tone: 'neutral' }
  return { label: '낮음', tone: 'ok' }
}

/** 높음 이상(≥10) 여부 — 우선 처리 대상 판정(목록·KPI·컴플라이언스 종합 공유 술어). */
export function isHighRisk(r: RiskItem): boolean {
  return riskScore(r) >= 10
}

/** 종결 여부 — 완료만 종결로 본다(식별·조치중은 미종결). 미종결·지연·종결률 산정의 공통 술어. */
export function isRiskClosed(r: RiskItem): boolean {
  return r.status === '완료'
}

export interface RiskKpis {
  total: number
  /** 미종결 (식별·조치중) */
  open: number
  /** 높음 이상 미종결 — 우선 처리 신호 */
  highOpen: number
  /** 조치기한 경과 미종결 — 지연 위험 */
  overdue: number
  /** 종결률(%) — 전건 종결 아니면 99 캡(거짓 100 방지), 0건은 0 (compliance·finance 경계 처리와 동일) */
  treatedRate: number
}

export function computeRiskKpis(items: RiskItem[], today: string): RiskKpis {
  const open = items.filter((r) => !isRiskClosed(r))
  const highOpen = open.filter(isHighRisk).length
  // 기한 경과 — YYYY-MM-DD 문자열 비교(dueDate < today 엄격), sr/projects 지연 술어와 동일 방식
  const overdue = open.filter((r) => r.dueDate < today).length
  const total = items.length
  const done = items.filter(isRiskClosed).length
  const treatedRate = total > 0 ? (done >= total ? 100 : Math.min(99, Math.round((done / total) * 100))) : 0
  return { total, open: open.length, highOpen, overdue, treatedRate }
}

/** 당월 위험 추세 스냅샷 upsert — 수동 기록(위험평가 화면)·일배치 공유 단일 경로(컴플라이언스 스냅샷과 대칭).
 *  같은 기간(월) 재기록은 갱신하므로 매일 호출돼도 당월 1건만 유지·값은 최신으로 refresh(위험 감소 추이). */
export function upsertRiskSnapshot(s: Store, by: string): RiskSnapshot {
  const k = computeRiskKpis(s.riskItems, today())
  const period = today().slice(0, 7)
  const snap = { period, at: nowStamp(), by, total: k.total, open: k.open, highOpen: k.highOpen, overdue: k.overdue, treatedRate: k.treatedRate }
  const existing = s.riskSnapshots.find((x) => x.period === period)
  if (existing) { Object.assign(existing, snap); return existing }
  const created: RiskSnapshot = { id: nextNo('RS', today().slice(0, 4), s.riskSnapshots.map((x) => x.id)), ...snap }
  s.riskSnapshots.push(created)
  return created
}
