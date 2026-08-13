/** 취약점 노출 우선순위 — 스코어링(자산 중요도 × 노출도)으로 조치 우선순위를 산출한다.
 *  (제품안내서 §05 AI 기능 04: "발견된 노출 서비스·EOL OS·미패치 SW를 자산 중요도와 결합해 조치 우선순위 산출")
 *  외부 노출 CVE·EOL OS 자산·미인가 SW·크리덴셜 노출을 한 축으로 모아 P1/P2/P3 로 순위화한다.
 *  읽기 전용 합성 뷰 — 각 항목은 기존 조치 화면(loops)으로 연결된다. */
import { today } from './dates'
import { eolOsOf } from './eol'
import { getStore } from './store'
import type { Asset, BizCriticality, RiskLevel } from './types'

export type VulnSource = '외부 노출 CVE' | 'EOL OS' | '미인가 SW' | '크리덴셜 노출'

export interface VulnItem {
  id: string
  source: VulnSource
  target: string
  detail: string
  /** 노출도/심각도 */
  severity: RiskLevel
  /** 자산 중요도 */
  criticality: RiskLevel
  /** 0~100 정규화 점수 */
  score: number
  tier: 'P1' | 'P2' | 'P3'
  /** 조치 화면 링크 */
  href: string
}

const W: Record<RiskLevel, number> = { 높음: 3, 중간: 2, 낮음: 1 }
const CRIT_MAP: Record<BizCriticality, RiskLevel> = { 핵심: '높음', 중요: '중간', 일반: '낮음' }

/** 휴리스틱 중요도 — 인터넷 노출·서버/네트워크·IDC 자산일수록 높다. */
function heuristicCriticality(opts: { internetFacing?: boolean; asset?: Asset }): RiskLevel {
  if (opts.internetFacing) return '높음'
  const a = opts.asset
  if (a?.category === '서버' || a?.category === '네트워크') return '높음'
  if (a?.location?.includes('IDC')) return '높음'
  if (a?.category === '가상자원') return '중간'
  return '낮음'
}

/** 자산 중요도 — 운영자 지정(업무 중요도)이 있으면 휴리스틱과 높은 쪽을 택한다.
 *  핵심 지정은 노후 단말도 끌어올리고, 서버는 미지정이어도 휴리스틱으로 높음을 유지한다(§05 자산 중요도 축). */
function assetCriticality(opts: { internetFacing?: boolean; asset?: Asset }): RiskLevel {
  const heuristic = heuristicCriticality(opts)
  const explicit = opts.asset?.criticality ? CRIT_MAP[opts.asset.criticality] : null
  if (!explicit) return heuristic
  return W[explicit] >= W[heuristic] ? explicit : heuristic
}

/** 점수 — 심각도 × 중요도(1~9)를 0~100 으로 정규화. */
function scoreOf(sev: RiskLevel, crit: RiskLevel): number {
  return Math.round(((W[sev] * W[crit]) / 9) * 100)
}
const tierOf = (score: number): VulnItem['tier'] => (score >= 67 ? 'P1' : score >= 34 ? 'P2' : 'P3')
const sevFromCvss = (cvss?: number): RiskLevel => ((cvss ?? 0) >= 7 ? '높음' : (cvss ?? 0) >= 4 ? '중간' : '낮음')

export interface VulnPriority {
  items: VulnItem[]
  p1: number
  p2: number
  p3: number
  bySource: { source: VulnSource; count: number }[]
}

export function buildVulnPriority(): VulnPriority {
  const s = getStore()
  const t = today()
  const items: VulnItem[] = []

  // 1) 외부 노출 CVE — 인터넷 노출이므로 중요도 높음, 심각도는 CVSS 기반.
  //    이미 조치(편입/차단 요청·완료)된 노출은 제외한다 — 미인가 SW(w.action)·크리덴셜(조치 완료) 제외와 동일한 '미조치' 기준.
  for (const e of s.external) {
    if (!e.cve || e.action) continue
    const severity = sevFromCvss(e.cvss)
    const criticality = assetCriticality({ internetFacing: true })
    const score = scoreOf(severity, criticality)
    items.push({
      id: `V-${e.id}`, source: '외부 노출 CVE', target: e.host,
      detail: `${e.cve} (CVSS ${e.cvss ?? '-'}) · ${e.services ?? '-'}`,
      severity, criticality, score, tier: tierOf(score), href: '/discovery/external',
    })
  }

  // 2) EOL OS 자산 — 지원 종료 경과 자산(운영 중). 미패치 상시 노출로 심각도 높음.
  for (const a of s.assets) {
    if (['폐기완료', '폐기예정'].includes(a.status)) continue
    const eol = eolOsOf(a.os, t)
    if (!eol) continue
    const criticality = assetCriticality({ asset: a })
    const score = scoreOf('높음', criticality)
    items.push({
      id: `V-EOL-${a.assetNo}`, source: 'EOL OS', target: a.assetNo,
      detail: `${eol.label} (EOL ${eol.eol} 경과) · ${a.model}`,
      severity: '높음', criticality, score, tier: tierOf(score),
      href: `/assets/register?q=${encodeURIComponent(a.assetNo)}`,
    })
  }

  // 3) 미인가 SW (미조치) — 설치 자산의 중요도와 결합
  for (const w of s.unauthorizedSw) {
    if (w.action) continue
    const asset = s.assets.find((x) => x.assetNo === w.assetNo)
    const criticality = assetCriticality({ asset })
    const score = scoreOf(w.risk, criticality)
    items.push({
      id: `V-${w.id}`, source: '미인가 SW', target: w.assetNo,
      detail: `${w.name} · ${w.kind}`,
      severity: w.risk, criticality, score, tier: tierOf(score), href: '/discovery/found',
    })
  }

  // 4) 크리덴셜 노출 (미조치) — 외부 서비스 인증 취약점, 중요도 높음
  for (const c of s.credentials) {
    if (c.status === '조치 완료') continue
    const criticality = assetCriticality({ internetFacing: true })
    const score = scoreOf(c.severity, criticality)
    items.push({
      id: `V-${c.id}`, source: '크리덴셜 노출', target: c.host,
      detail: `${c.service} · ${c.issue}`,
      severity: c.severity, criticality, score, tier: tierOf(score), href: '/discovery/external',
    })
  }

  // 점수 내림차순 — 동점이면 P1 우선(tier), 그다음 source 안정 정렬
  items.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source))

  const SOURCES: VulnSource[] = ['외부 노출 CVE', 'EOL OS', '미인가 SW', '크리덴셜 노출']
  return {
    items,
    p1: items.filter((i) => i.tier === 'P1').length,
    p2: items.filter((i) => i.tier === 'P2').length,
    p3: items.filter((i) => i.tier === 'P3').length,
    bySource: SOURCES.map((source) => ({ source, count: items.filter((i) => i.source === source).length })),
  }
}
