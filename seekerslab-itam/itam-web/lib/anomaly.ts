/** 이상 자산 행위 탐지 — 자산별 평시 프로파일(설치 SW·상태·데이터 반출 패턴) 대비 이탈을 산출한다.
 *  (제품안내서 §05 AI 기능 02: "비지도 이상탐지 — 미인가 SW 설치, 휴면 자산의 갑작스런 활동, 서버의 비정상 외부 통신")
 *  취약점 우선순위(기능 04·정적 노출도)와 달리 '행위 이탈'을 한 축으로 모은 읽기 전용 합성 뷰. 각 항목은 조치 화면으로 연결된다. */
import { getStore } from './store'
import type { RiskLevel } from './types'

export type AnomalyKind = '미인가 SW 설치' | '유휴 자산 사용' | 'USB 대용량 반출'

export interface AnomalyItem {
  id: string
  kind: AnomalyKind
  target: string
  detail: string
  /** 이탈 심각도 */
  severity: RiskLevel
  /** 판정 근거(어떤 프로파일에서 어떻게 벗어났는가) */
  basis: string
  /** 조치 화면 링크 */
  href: string
}

export interface AnomalyResult {
  items: AnomalyItem[]
  byKind: { kind: AnomalyKind; count: number }[]
}

const W: Record<RiskLevel, number> = { 높음: 3, 중간: 2, 낮음: 1 }

export function buildAnomalies(): AnomalyResult {
  const s = getStore()
  const items: AnomalyItem[] = []

  // 1) 미인가 SW 설치 — 평시 설치 SW 프로파일 대비 이탈(EDR 인벤토리). 미조치분.
  for (const w of s.unauthorizedSw.filter((x) => !x.action)) {
    items.push({ id: `AN-${w.id}`, kind: '미인가 SW 설치', target: w.assetNo, detail: `${w.name} (${w.kind})`, severity: w.risk, basis: `EDR 설치 SW 인벤토리 이탈 · 최초 ${w.firstSeen}`, href: '/discovery/found' })
  }

  // 2) 유휴 자산 사용 — 대장상 유휴(휴면)인데 실사에서 사용 중 발견(미승인 불출). 상태 불일치 미해결.
  for (const d of s.surveyDiffs.filter((x) => x.kind === '상태 불일치' && x.actual.includes('사용') && x.status !== '조정 완료')) {
    items.push({ id: `AN-${d.id}`, kind: '유휴 자산 사용', target: d.assetNo, detail: `대장 '${d.expected}' / 실사 '${d.actual}'`, severity: '높음', basis: `재물조사 실사 상태 이탈 · ${d.roundId}`, href: '/inventory/survey' })
  }

  // 3) USB 대용량 반출 — 정상 사용 패턴 대비 이상 데이터 반출(EDR 장치 제어·DLP). 미조치분.
  for (const u of s.usbFindings.filter((x) => !x.action && x.kind === '대용량 반출 의심')) {
    items.push({ id: `AN-${u.id}`, kind: 'USB 대용량 반출', target: u.assetNo, detail: `${u.device}${u.note ? ` · ${u.note}` : ''}`, severity: u.risk, basis: `EDR 장치 제어 로그 이탈 · 최초 ${u.firstSeen}`, href: '/discovery/found' })
  }

  items.sort((a, b) => W[b.severity] - W[a.severity] || a.kind.localeCompare(b.kind))
  const KINDS: AnomalyKind[] = ['미인가 SW 설치', '유휴 자산 사용', 'USB 대용량 반출']
  return { items, byKind: KINDS.map((kind) => ({ kind, count: items.filter((i) => i.kind === kind).length })) }
}
