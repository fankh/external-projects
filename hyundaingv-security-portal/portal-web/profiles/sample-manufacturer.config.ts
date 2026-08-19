/** 고객사 프로필 예시 — 제조업 고객사 배포 구성 (재사용 프레임워크 커스터마이징 데모).
 *  적용: PORTAL_PROFILE=manufacturer 환경변수로 실행하면 이 구성이 그대로 뜬다.
 *  실배포에서는 adapterId 가 가리키는 고객사 어댑터 구현(REST API·DB 연계)을
 *  lib/integrations/ 에 추가한다 — 데모에서는 목업 구현에 매핑되어 있다.
 *
 *  기본 프로필과의 차이:
 *   - 브랜딩: 고객사명·제품명 표기 변경 (전 화면 타이틀바·상태바·로그인에 반영)
 *   - 그룹웨어가 SMS 발송까지 겸함 → 홈페이지 서버 SMS 채널 제거 (6채널 구성)
 *   - 자산관리는 고객사 ERP 내장 모듈 → erp-asset 어댑터로 바인딩
 *   - 보안·출력물 DB 연계가 계약 범위 밖 → 기본 비활성 유지
 */
import type { ChannelBinding, PortalBrand } from '@/lib/integrations/types'

export const PORTAL: PortalBrand = {
  customer: '한빛제조 (예시)',
  productName: 'HANBIT IT PORTAL',
  productSub: 'IT · Security Governance',
  version: 'v1.0',
}

export const CHANNELS: ChannelBinding[] = [
  { id: 'groupware-mail', kind: 'mail', name: '그룹웨어 메일·문자', transport: 'REST API', usage: '안내메일·문자 발송 (그룹웨어 통합 발송)', adapterId: 'hanbit-gw-mail', enabledByDefault: true },
  { id: 'groupware-approval', kind: 'approval', name: '그룹웨어 전자결재', transport: 'REST API', usage: '결재 상신 연동 (그룹웨어 결재함 푸시)', adapterId: 'hanbit-approval', enabledByDefault: true },
  { id: 'groupware-sso', kind: 'sso', name: '그룹웨어 SSO', transport: 'SAML', usage: 'SSO 인증 (SAML)', adapterId: 'hanbit-sso', enabledByDefault: true },
  { id: 'hr-sync', kind: 'hr', name: '인사 시스템', transport: 'DB 연계', usage: '사용자 기본정보 (일배치)', adapterId: 'hanbit-hr', enabledByDefault: true },
  { id: 'asset-api', kind: 'asset', name: 'ERP 자산 모듈', transport: 'REST API', usage: '자산정보 조회 · 자산등록번호 취득', adapterId: 'erp-asset', enabledByDefault: true },
  { id: 'security-db', kind: 'secdata', name: '보안·출력물 시스템', transport: 'DB 연계', usage: '출력물 자료 조회 (2차 범위)', adapterId: 'mock-secdata', enabledByDefault: false },
  { id: 'sec-monitor', kind: 'secmon', name: '보안관제 시스템', transport: 'REST API', usage: '탐지 이벤트 → 보안위반 자동 등록 (DLP·EDR)', adapterId: 'mock-secmon', enabledByDefault: false },
]
