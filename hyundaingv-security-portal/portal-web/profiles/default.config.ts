/** 기본 프로필 — 데모 고객사 구성. 제품안내서 §V 시스템 연동 아키텍처 5종을
 *  목업 어댑터로 바인딩한다. */
import type { ChannelBinding, PortalBrand } from '@/lib/integrations/types'

export const PORTAL: PortalBrand = {
  customer: '데모 고객사',
  productName: 'GOVERNANCE PORTAL',
  productSub: 'Enterprise IT · Security',
  version: 'v0.39',
}

export const CHANNELS: ChannelBinding[] = [
  { id: 'groupware-mail', kind: 'mail', name: '그룹웨어 메일', transport: 'REST API', usage: '안내메일 발송 (미서약·점검 경과·확인서 요청)', adapterId: 'mock-mail', enabledByDefault: true },
  { id: 'groupware-approval', kind: 'approval', name: '그룹웨어 전자결재', transport: 'REST API', usage: '결재 상신 연동 (결재는 그룹웨어에서 확인)', adapterId: 'internal-approval', enabledByDefault: true },
  { id: 'groupware-sso', kind: 'sso', name: '그룹웨어 SSO', transport: 'SAML', usage: 'SSO 인증 (IdP 어설션)', adapterId: 'mock-sso', enabledByDefault: true },
  { id: 'hr-sync', kind: 'hr', name: '인사·근태 시스템', transport: '인터페이스', usage: '사용자 기본정보·근태 (서약 대상·미서약 판별 기준)', adapterId: 'mock-hr', enabledByDefault: true },
  { id: 'asset-api', kind: 'asset', name: '자산관리시스템', transport: 'REST API', usage: '자산정보 조회 · 신규 자산등록번호 취득', adapterId: 'mock-asset', enabledByDefault: true },
  { id: 'security-db', kind: 'secdata', name: '보안·출력물 시스템', transport: 'DB 연계', usage: '보안·출력물 자료 조회 (일배치 이관)', adapterId: 'mock-secdata', enabledByDefault: false },
  { id: 'sms-gateway', kind: 'sms', name: '문자(SMS) 발송', transport: 'REST API', usage: '문자 발송 (홈페이지 서버 경유)', adapterId: 'mock-sms', enabledByDefault: true },
]
