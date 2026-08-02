import type { AssetCategory } from './types'

/** 발견 자산의 자유 서술 유형 문자열 → 표준 자산 유형(AssetCategory) 자동 매핑.
 *  제품안내서 §05 자동분류: "스캔 배너·설치 SW·모델명을 표준 유형으로 자동 매핑 — 발견 자산의 수기 분류 제거".
 *  규칙 하이브리드(우선순위 순서 매칭). 편입 시 대장 category 로 쓰이고, 발견 화면엔 제안으로 표시된다.
 *  클라이언트 안전(스토어·서버 모듈 비의존) — FoundView(표시)와 decide()(편입) 가 공유해 화면과 대장이 일치한다. */
export function classifyDiscoveredType(type: string): AssetCategory {
  const t = (type || '').toLowerCase()
  // 순서 주의: 가상자원(클라우드 인스턴스) → 네트워크 → 주변기기 → SW → 서버(NAS·스토리지 포함) → 단말(기본)
  if (/vm|ec2|azure|가상|인스턴스|instance|쿠버|k8s/.test(t)) return '가상자원'
  if (/네트워크|스위치|switch|공유기|라우터|router|방화벽|firewall|\bap\b|액세스\s*포인트|access\s*point/.test(t)) return '네트워크'
  if (/주변기기|프린터|printer|스캐너|scanner|복합기|프로젝터|projector/.test(t)) return '주변기기'
  if (/oauth|saas|소프트웨어|software|애플리케이션|application|\bsw\b|\bapp\b|앱|라이선스|license/.test(t)) return 'SW'
  if (/서버|server|nas|스토리지|storage|백업|backup/.test(t)) return '서버'
  return '단말'
}
