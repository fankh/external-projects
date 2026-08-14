import type { AssetCategory } from './types'

/** 자동분류 규칙(우선순위 순서) — 관측 유형 문자열을 표준 자산 유형으로 매핑한다.
 *  순서 주의: 가상자원(클라우드 인스턴스) → 네트워크 → 주변기기 → SW → 서버(NAS·스토리지 포함) → 단말(기본). */
const CLASSIFY_RULES: { re: RegExp; category: AssetCategory; basis: string; confidence: number }[] = [
  { re: /vm|ec2|azure|가상|인스턴스|instance|쿠버|k8s/, category: '가상자원', basis: '가상화·클라우드 키워드', confidence: 0.95 },
  { re: /네트워크|스위치|switch|공유기|라우터|router|방화벽|firewall|\bap\b|액세스\s*포인트|access\s*point/, category: '네트워크', basis: '네트워크 장비 키워드', confidence: 0.94 },
  { re: /주변기기|프린터|printer|스캐너|scanner|복합기|프로젝터|projector/, category: '주변기기', basis: '주변기기 키워드', confidence: 0.93 },
  { re: /oauth|saas|소프트웨어|software|애플리케이션|application|\bsw\b|\bapp\b|앱|라이선스|license/, category: 'SW', basis: '소프트웨어 키워드', confidence: 0.9 },
  { re: /서버|server|nas|스토리지|storage|백업|backup/, category: '서버', basis: '서버·스토리지 키워드', confidence: 0.92 },
]

export interface ClassifyResult {
  category: AssetCategory
  /** 신뢰도(0~1) — 특정 규칙 매칭이면 높고, 기본값(단말) 폴백이면 낮다. 결정적. */
  confidence: number
  /** 판단 근거 — 어떤 규칙으로 분류됐는지(제안 화면에 근거로 표시) */
  basis: string
  /** 모델·제조사 힌트 — 관측 문자열의 괄호 안 스펙(예: '단말 (Raspberry Pi)' → 'Raspberry Pi'). 없으면 '-' */
  model: string
}

/** 발견 자산의 자유 서술 유형 → 표준 유형·신뢰도·근거·모델 힌트.
 *  제품안내서 §05 자동분류: "스캔 배너·설치 SW·모델명을 표준 유형·제조사·모델로 자동 매핑 — 수기 분류 제거".
 *  클라이언트 안전(스토어·서버 모듈 비의존) — 화면·편입·제안 패널이 공유해 표시와 대장이 일치한다. */
export function classifyDiscoveredDetail(type: string): ClassifyResult {
  const raw = type || ''
  const t = raw.toLowerCase()
  const paren = raw.match(/\(([^)]+)\)/)?.[1]?.trim()
  const model = paren && paren.length ? paren : '-'
  for (const r of CLASSIFY_RULES) {
    if (r.re.test(t)) return { category: r.category, confidence: r.confidence, basis: r.basis, model }
  }
  return { category: '단말', confidence: 0.66, basis: '기본값(단말) — 특정 규칙 미매칭', model }
}

/** 표준 유형만 필요할 때(편입 시 대장 category, 발견 화면 컬럼). classifyDiscoveredDetail 과 동일 산출을 공유한다. */
export function classifyDiscoveredType(type: string): AssetCategory {
  return classifyDiscoveredDetail(type).category
}
