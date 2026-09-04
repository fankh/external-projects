/** 이상 자산 행위 탐지 — 자산별 평시 프로파일(설치 SW·상태·데이터 반출 패턴) 대비 이탈을 산출한다.
 *  (제품안내서 §05 AI 기능 02: "비지도 이상탐지 — 미인가 SW 설치, 휴면 자산의 갑작스런 활동, 서버의 비정상 외부 통신")
 *  취약점 우선순위(기능 04·정적 노출도)와 달리 '행위 이탈'을 한 축으로 모은 읽기 전용 합성 뷰. 각 항목은 조치 화면으로 연결된다. */
import { SORT_LOCALE } from './dates'
import { DISPOSAL_STATUSES } from './types'
import { getStore } from './store'
import type { RiskLevel } from './types'

export type AnomalyKind = '미인가 SW 설치' | '유휴 자산 사용' | '서버 비정상 외부 통신' | 'USB 대용량 반출'

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
  // 폐기 경로 자산 — 소거·처분됐거나 폐기 선정된 장비의 설치·반출 기록은 '지금 일어나는 행위 이탈'이 아니다.
  //  제거·차단을 요청할 대상이 없는데 목록과 '높음 심각도' 집계를 차지해 실재하는 이탈을 밀어낸다
  //  (취약점 조치 우선순위의 EOL·미인가 SW 축이 쓰는 기준과 동일). 위반 기록 자체는 각 화면에 그대로 남는다.
  //  네 축(미인가 SW·유휴 자산 사용·비정상 외부 통신·USB 반출)에 모두 적용한다 — 두 축에만 걸어 두면 같은 자산이
  //  축에 따라 사라졌다 남았다 해서, '조치할 수 없는 건은 뺀다'는 규칙이 목록 안에서 반쪽만 지켜진다.
  const disposedAsset = new Set(s.assets.filter((a) => DISPOSAL_STATUSES.includes(a.status)).map((a) => a.assetNo))

  // 1) 미인가 SW 설치 — 평시 설치 SW 프로파일 대비 이탈(EDR 인벤토리). 미조치분.
  for (const w of s.unauthorizedSw.filter((x) => !x.action && !disposedAsset.has(x.assetNo))) {
    items.push({ id: `AN-${w.id}`, kind: '미인가 SW 설치', target: w.assetNo, detail: `${w.name} (${w.kind})`, severity: w.risk, basis: `EDR 설치 SW 인벤토리 이탈 · 최초 ${w.firstSeen}`, href: '/discovery/found' })
  }

  // 2) 유휴 자산 사용 — 대장상 유휴(휴면)인데 실사에서 사용 중 발견(미승인 불출). 상태 불일치 미해결.
  for (const d of s.surveyDiffs.filter((x) => x.kind === '상태 불일치' && x.actual.includes('사용') && x.status !== '조정 완료' && !disposedAsset.has(x.assetNo))) {
    items.push({ id: `AN-${d.id}`, kind: '유휴 자산 사용', target: d.assetNo, detail: `대장 '${d.expected}' / 실사 '${d.actual}'`, severity: '높음', basis: `재물조사 실사 상태 이탈 · ${d.roundId}`, href: '/inventory/survey' })
  }

  // 3) 서버 비정상 외부 통신 — 평시(내부 통신) 프로파일 대비 외부 아웃바운드 이탈(C2 의심). §05 기능02가 명시한 세 번째 행위.
  //    AI 비지도 이상탐지가 직접 산출한 '이상탐지' 제안을 행위 뷰에 집약한다(반려=오탐은 제외). 제안→확인 루프는 /ai/insights.
  //    이미 NAC 격리가 집행된 자산은 뺀다 — 나머지 세 축은 모두 미조치분만 센다(미인가 SW·USB 는 !action, 유휴 자산 사용은 조정 미완).
  //    승인 직후는 격리 결재가 진행 중이라 여전히 열린 이탈이지만, 차단이 집행되면(quarantinedAt) 조치가 끝난 것이다.
  //    안 빼면 격리된 자산이 '이상 행위' 목록·심각도 집계에 영구히 남아 조치 완료분과 미조치분이 섞인다.
  const quarantined = new Set(s.assets.filter((a) => a.quarantinedAt).map((a) => a.assetNo))
  for (const n of s.insights.filter((x) => x.kind === '이상탐지' && x.status !== '반려')) {
    const tgt = n.refId ?? (n.title.includes('—') ? n.title.split('—').pop()!.trim() : n.title)
    if (quarantined.has(tgt) || disposedAsset.has(tgt)) continue
    items.push({ id: `AN-${n.id}`, kind: '서버 비정상 외부 통신', target: tgt, detail: n.title.split('—')[0].trim(), severity: n.severity, basis: `AI 비지도 이상탐지 · 평시 프로파일 이탈 · ${n.evidence}`, href: '/ai/insights' })
  }

  // 4) USB 대용량 반출 — 정상 사용 패턴 대비 이상 데이터 반출(EDR 장치 제어·DLP). 미조치분.
  for (const u of s.usbFindings.filter((x) => !x.action && x.kind === '대용량 반출 의심' && !disposedAsset.has(x.assetNo))) {
    items.push({ id: `AN-${u.id}`, kind: 'USB 대용량 반출', target: u.assetNo, detail: `${u.device}${u.note ? ` · ${u.note}` : ''}`, severity: u.risk, basis: `EDR 장치 제어 로그 이탈 · 최초 ${u.firstSeen}`, href: '/discovery/found' })
  }

  items.sort((a, b) => W[b.severity] - W[a.severity] || a.kind.localeCompare(b.kind, SORT_LOCALE))
  const KINDS: AnomalyKind[] = ['미인가 SW 설치', '유휴 자산 사용', '서버 비정상 외부 통신', 'USB 대용량 반출']
  return { items, byKind: KINDS.map((kind) => ({ kind, count: items.filter((i) => i.kind === kind).length })) }
}
