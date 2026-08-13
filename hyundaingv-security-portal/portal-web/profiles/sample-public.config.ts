/** 고객사 프로필 예시 2 — 공공기관 배포 구성 (재사용 프레임워크 비종속성 증명용).
 *  적용: PORTAL_PROFILE=public 환경변수로 실행하면 이 구성이 그대로 뜬다.
 *
 *  이 프로필의 존재 목적은 "기존 두 예시(default·manufacturer)에 우연히 결합되지
 *  않았는가"를 검증하는 것이다 — 포털 본체 코드를 한 줄도 고치지 않고, 프로필 추가와
 *  gov-* 어댑터 등록(registry)만으로 다른 채널 토폴로지가 떠야 한다.
 *
 *  두 예시와의 의도적 차이(토폴로지 커버리지):
 *   - 문자(SMS)를 그룹웨어에 합치지 않고 별도 실채널로 유지 (default 와 같은 축, manufacturer 와 대비)
 *   - 보안·출력물 시스템(secdata)을 기본 활성 — 출력물 개인정보 관제가 계약 범위 (양 예시 모두 기본 비활성이던 축)
 *   - 전 채널 adapterId 를 gov-* 로 신규 — registry 에 등록만 하면 즉시 해석된다
 */
import type { ChannelBinding, PortalBrand } from '@/lib/integrations/types'

export const PORTAL: PortalBrand = {
  customer: '한울공공기관 (예시)',
  productName: 'HANUL GOV PORTAL',
  productSub: 'IT·보안 거버넌스',
  version: 'v1.0',
}

export const CHANNELS: ChannelBinding[] = [
  { id: 'groupware-mail', kind: 'mail', name: '전자문서 메일', transport: 'REST API', usage: '안내메일 발송 (전자문서 시스템 연동)', adapterId: 'gov-mail', enabledByDefault: true },
  { id: 'sms-gateway', kind: 'sms', name: '문자(SMS) 발송', transport: 'REST API', usage: '문자 발송 (기관 SMS 게이트웨이)', adapterId: 'gov-sms', enabledByDefault: true },
  { id: 'groupware-approval', kind: 'approval', name: '전자결재', transport: 'REST API', usage: '결재 상신 연동 — 실구현 예정', adapterId: 'internal-approval', enabledByDefault: true, planned: true },
  { id: 'groupware-sso', kind: 'sso', name: '행정전자서명(GPKI) SSO', transport: 'SAML', usage: 'SSO 인증 — 실구현 예정', adapterId: 'gov-sso', enabledByDefault: true, planned: true },
  { id: 'hr-sync', kind: 'hr', name: '인사·근태 시스템', transport: '인터페이스', usage: '사용자 기본정보·근태 (일배치)', adapterId: 'gov-hr', enabledByDefault: true },
  { id: 'asset-api', kind: 'asset', name: '자산관리 시스템', transport: 'REST API', usage: '자산정보 조회 · 자산등록번호 취득', adapterId: 'gov-asset', enabledByDefault: true },
  { id: 'security-db', kind: 'secdata', name: '보안·출력물 관제', transport: 'DB 연계', usage: '출력물 자료 조회 (일배치 이관 — 계약 범위)', adapterId: 'gov-secdata', enabledByDefault: true },
]
