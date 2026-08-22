/** 자동분류 제안 합성 뷰(§05 AI 기능 01) — 대장에 없는 발견 자산(미등록·미확인)의 관측 유형을
 *  표준 자산 유형으로 자동 매핑하고 신뢰도·근거를 함께 제시한다. 편입 판정(대장 반영)의 선행 근거.
 *  읽기 전용 — 실제 편입은 발견 자산 화면(discovery/found)의 편입 결재로 이어진다. */
import { classifyDiscoveredDetail } from './classify'
import { getStore } from './store'
import type { AssetCategory, RiskLevel } from './types'

export interface AutoClassifyRow {
  id: string
  hostname: string
  channel: string
  rawType: string
  category: AssetCategory
  confidence: number
  basis: string
  model: string
  risk: RiskLevel
  state: string
}

export function buildAutoClassify(): {
  rows: AutoClassifyRow[]
  total: number
  high: number
  low: number
  avgConfidence: number
  byCategory: { category: AssetCategory; n: number }[]
} {
  const s = getStore()
  // 자동분류 대상 = 대장에 확정되지 않은 발견 자산(미등록·미확인). 등록·일치/등록·불일치는 이미 대장 유형이 있어 제외.
  //  '관리 제외'(협력사 장비·게스트 단말 등 비자산 판정)도 뺀다 — 제외의 정의가 "미등록 갭·Shadow IT 신호에서 뺀다"인데
  //  자동분류 패널은 그 신호 중 하나다. 비자산으로 판정한 건에 표준 자산 유형을 붙여 분류 대상 수·평균 신뢰도·유형 분포까지
  //  부풀리면 제외 판정이 무의미해진다. 편입·격리 요청 건은 남긴다 — 판정이 진행 중이라 유형 근거가 여전히 쓰인다.
  const targets = s.discovered.filter((d) => (d.state === '미등록' || d.state === '미확인') && d.action !== '관리 제외')
  const rows: AutoClassifyRow[] = targets
    .map((d) => {
      const c = classifyDiscoveredDetail(d.type)
      return {
        id: d.id,
        hostname: d.hostname,
        channel: d.channel,
        rawType: d.type,
        category: c.category,
        confidence: c.confidence,
        basis: c.basis,
        model: c.model,
        risk: d.risk,
        state: d.state,
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
  const high = rows.filter((r) => r.confidence >= 0.9).length
  const low = rows.filter((r) => r.confidence < 0.9).length
  const avgConfidence = rows.length ? Math.round((rows.reduce((n, r) => n + r.confidence, 0) / rows.length) * 100) : 0
  const cats = [...new Set(rows.map((r) => r.category))] as AssetCategory[]
  const byCategory = cats
    .map((category) => ({ category, n: rows.filter((r) => r.category === category).length }))
    .sort((a, b) => b.n - a.n)
  return { rows, total: rows.length, high, low, avgConfidence, byCategory }
}
