/** 고객사 프로필 예시 3 — 금융기관 배포 구성 (재사용 프레임워크의 산업 확장 증명용).
 *  적용: PORTAL_PROFILE=finance 환경변수로 실행하면 이 구성이 그대로 뜬다.
 *
 *  기존 두 예시(manufacturer 제조업·public 공공기관)에 금융권 토폴로지를 더해, 포털 본체 코드를
 *  한 줄도 고치지 않고 프로필 추가 + fin-* 어댑터 등록(registry)만으로 3번째 산업이 뜨는지 검증한다.
 *  (2개면 '우연한 비결합'을 의심할 여지가 남지만, 서로 다른 3개 산업 토폴로지가 본체 무변경으로 뜨면
 *   커스터마이징 표면이 프로필·어댑터 계층으로 확실히 격리됐음을 보인다.)
 *
 *  금융권 특성 반영(토폴로지 커버리지):
 *   - 문자(SMS)를 OTP·이상거래·경과 알림용 별도 실채널로 유지 (public 과 같은 축, manufacturer 와 대비)
 *   - 보안·출력물 관제(secdata) 기본 활성 — 개인정보·출력물 통제가 강한 규제 대상(금융)
 *   - 전 채널 adapterId 를 fin-* 로 신규 — registry 에 등록만 하면 즉시 해석된다
 */
import type { ChannelBinding, PortalBrand } from '@/lib/integrations/types'

export const PORTAL: PortalBrand = {
  customer: '나래금융 (예시)',
  productName: 'NARAE FIN PORTAL',
  productSub: 'IT·보안 거버넌스',
  version: 'v1.0',
}

export const CHANNELS: ChannelBinding[] = [
  { id: 'groupware-mail', kind: 'mail', name: '그룹웨어 메일', transport: 'REST API', usage: '안내메일 발송 (사내 메일 연동)', adapterId: 'fin-mail', enabledByDefault: true },
  { id: 'sms-gateway', kind: 'sms', name: '문자(SMS)·알림', transport: 'REST API', usage: 'OTP·이상거래·경과 알림 (금융 SMS 게이트웨이)', adapterId: 'fin-sms', enabledByDefault: true },
  { id: 'groupware-approval', kind: 'approval', name: '전자결재', transport: 'REST API', usage: '결재 상신 연동 (그룹웨어 결재함 푸시)', adapterId: 'fin-approval', enabledByDefault: true },
  { id: 'groupware-sso', kind: 'sso', name: '통합인증 SSO', transport: 'SAML', usage: 'SSO 인증 (SAML)', adapterId: 'fin-sso', enabledByDefault: true },
  { id: 'hr-sync', kind: 'hr', name: '인사·근태 시스템', transport: '인터페이스', usage: '사용자 기본정보·근태 (일배치)', adapterId: 'fin-hr', enabledByDefault: true },
  { id: 'asset-api', kind: 'asset', name: '자산관리 시스템', transport: 'REST API', usage: '자산정보 조회 · 자산등록번호 취득', adapterId: 'fin-asset', enabledByDefault: true },
  { id: 'security-db', kind: 'secdata', name: '보안·출력물 관제', transport: 'DB 연계', usage: '출력물 자료 조회 (일배치 이관 — 개인정보 통제)', adapterId: 'fin-secdata', enabledByDefault: true },
  { id: 'sec-monitor', kind: 'secmon', name: '보안관제(SIEM)', transport: 'REST API', usage: '탐지 이벤트 → 보안위반 자동 등록 (DLP·EDR·이상행위)', adapterId: 'fin-secmon', enabledByDefault: false },
]
