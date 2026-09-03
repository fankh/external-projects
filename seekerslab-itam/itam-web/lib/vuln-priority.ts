/** 취약점 노출 우선순위 — 스코어링(자산 중요도 × 노출도)으로 조치 우선순위를 산출한다.
 *  (제품안내서 §05 AI 기능 04: "발견된 노출 서비스·EOL OS·미패치 SW를 자산 중요도와 결합해 조치 우선순위 산출")
 *  외부 노출 CVE·EOL OS 자산·미인가 SW·크리덴셜 노출을 한 축으로 모아 P1/P2/P3 로 순위화한다.
 *  읽기 전용 합성 뷰 — 각 항목은 기존 조치 화면(loops)으로 연결된다. */
import { NON_OPERATIONAL_STATUSES } from './types'
import { today, SORT_LOCALE } from './dates'
import { eolOsOf, isEolTarget } from './eol'
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

/** 점수 — 심각도 × 중요도(1~9)를 0~100 으로 정규화. floor 로 절사한다(반올림 아님):
 *  중간×높음=66.67 이 반올림되면 67 이 되어 P1 컷오프(≥67)를 넘어 P2 가 P1 로 오분류된다(리포트 P2 범위 라벨 '34~66'
 *  이 66 을 상한으로 명시 — 66.67 은 P2). 미집행률·상각률과 동일한 반올림 오분류 계열(cost.ts depreciationPct 도 floor). */
function scoreOf(sev: RiskLevel, crit: RiskLevel): number {
  return Math.floor(((W[sev] * W[crit]) / 9) * 100)
}
/** 등급 판정 — 보안담당이 관리하는 위험도 기준(riskPolicy)의 컷오프로 P1/P2/P3 를 나눈다.
 *  임계값을 인자로 받아, 정책 참조 없이 순수 함수로 유지한다(호출부에서 정책 주입 — 누락 시 tsc 가 잡음). */
const tierOf = (score: number, p1Min: number, p2Min: number): VulnItem['tier'] => (score >= p1Min ? 'P1' : score >= p2Min ? 'P2' : 'P3')
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
  // 위험도 기준 — 보안담당이 관리하는 P1/P2 컷오프. 화면·리포트가 동일 정책을 참조하도록 스토어에서 읽는다.
  const { p1MinScore: p1Min, p2MinScore: p2Min } = s.riskPolicy
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
      severity, criticality, score, tier: tierOf(score, p1Min, p2Min), href: '/discovery/external',
    })
  }

  // 2) EOL OS 자산 — 지원 종료 경과 자산(운영 중). 미패치 상시 노출로 심각도 높음.
  for (const a of s.assets) {
    // EOL 대상 판정은 lib/eol 의 isEolTarget 한 곳만 쓴다 — 대장 필터·대시보드 큐·AI 답변·EOL 통보가 모두 그것을
    //  쓰는데 여기만 폐기 두 상태로 좁게 걸러, 분실·수리중·반납대기 자산이 취약점 우선순위에만 남았다(같은 개념 두 정의).
    //  실물이 없거나 업체에 가 있는 자산은 패치·교체를 지시할 대상이 아니라 P1/P2 목록에서 실재 대상을 밀어낸다.
    if (!isEolTarget(a.status, a.os, t)) continue
    const eol = eolOsOf(a.os, t)!
    const criticality = assetCriticality({ asset: a })
    const score = scoreOf('높음', criticality)
    items.push({
      id: `V-EOL-${a.assetNo}`, source: 'EOL OS', target: a.assetNo,
      detail: `${eol.label} (EOL ${eol.eol} 경과) · ${a.model}`,
      severity: '높음', criticality, score, tier: tierOf(score, p1Min, p2Min),
      href: `/assets/register?q=${encodeURIComponent(a.assetNo)}`,
    })
  }

  // 3) 미인가 SW (미조치) — 설치 자산의 중요도와 결합
  for (const w of s.unauthorizedSw) {
    if (w.action) continue
    const asset = s.assets.find((x) => x.assetNo === w.assetNo)
    // 폐기 경로 자산의 미인가 SW 는 조치 우선순위가 아니다 — 같은 함수의 EOL OS 축이 이미 쓰는 기준을 맞춘다.
    // 비운영 자산의 미인가 SW 는 조치 우선순위가 아니다 — 같은 함수의 EOL OS 축이 쓰는 기준(isEolTarget →
    //  NON_OPERATIONAL_STATUSES)을 그대로 맞춘다. 그전에는 여기만 폐기 두 상태로 좁게 걸러, 분실·수리중·
    //  반납대기 자산의 미인가 SW 가 P1/P2/P3 목록에 남았다(주석은 두 축이 같은 기준이라고 적고 있었다).
    //  실물이 사라졌거나 업체에 가 있는 장비에는 SW 제거를 요청할 대상이 없고, 목록에 남으면 실재하는
    //  조치 대상을 밀어낸다 — EOL 축이 같은 이유로 이미 빼고 있던 자산들이다.
    if (asset && NON_OPERATIONAL_STATUSES.includes(asset.status)) continue
    const criticality = assetCriticality({ asset })
    const score = scoreOf(w.risk, criticality)
    items.push({
      id: `V-${w.id}`, source: '미인가 SW', target: w.assetNo,
      detail: `${w.name} · ${w.kind}`,
      severity: w.risk, criticality, score, tier: tierOf(score, p1Min, p2Min), href: '/discovery/found',
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
      severity: c.severity, criticality, score, tier: tierOf(score, p1Min, p2Min), href: '/discovery/external',
    })
  }

  // 점수 내림차순 — 동점이면 P1 우선(tier), 그다음 source 안정 정렬
  items.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source, SORT_LOCALE))

  const SOURCES: VulnSource[] = ['외부 노출 CVE', 'EOL OS', '미인가 SW', '크리덴셜 노출']
  return {
    items,
    p1: items.filter((i) => i.tier === 'P1').length,
    p2: items.filter((i) => i.tier === 'P2').length,
    p3: items.filter((i) => i.tier === 'P3').length,
    bySource: SOURCES.map((source) => ({ source, count: items.filter((i) => i.source === source).length })),
  }
}
