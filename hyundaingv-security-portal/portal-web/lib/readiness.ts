/** 배포 준비 상태 — 실배포 전 확인해야 할 런타임 구성 신호를 한곳에 모은다.
 *  연동·인프라 화면(ADMIN)에 카드로 노출한다. 어댑터 계약 자가진단(conformance)과 짝을 이뤄,
 *  운영자가 새 고객사 배포 시 "프로덕션 준비됐는가"를 한눈에 본다. */
import { adapterRealitySummary } from './integrations/registry'
import { SESSION_SECRET_IS_DEFAULT } from './session'

export interface ReadinessItem {
  key: string
  /** ok = 프로덕션 안전, warn = 데모/개발 기본값(실배포 전 조치 권장), info = 참고 */
  level: 'ok' | 'warn' | 'info'
  value: string
  detail: string
}

export function deployReadiness(): ReadinessItem[] {
  const prod = process.env.NODE_ENV === 'production'
  const dataFile = process.env.PORTAL_DATA_FILE
  const notify = Number(process.env.PORTAL_NOTIFY_INTERVAL_MS)
  const cookieSecure = process.env.PORTAL_COOKIE_SECURE === '1'
  const profile = process.env.PORTAL_PROFILE || 'default'
  // 연동 어댑터 실체 — 활성 채널이 실 시스템에 연결됐는지. 목업(mock-*)은 오프라인 데모라 실제
  // 발송·동기화·인증이 없다. 자가진단(conformance)은 목업도 유효 어댑터로 통과하므로 '아직 목업인가'는
  // 별도 신호가 필요하다(전량 목업 상태로 실 배포하면 안내메일·인사연동·SSO 가 조용히 동작하지 않는다).
  const { real: adReal, mock: adMock } = adapterRealitySummary()
  const adActive = adReal + adMock
  // SSO(SAML) 필수 구성 — IdP SSO URL(로그인 리다이렉트)·서명 인증서(어설션 검증). 둘 다 있어야
  // SP-initiated SSO 가 동작하고, 하나만 있으면 로그인·검증이 실패한다(saml.ts 소비). SP EntityID·
  // ACS 는 기본값·요청 파생이라 필수 아님. SSO 는 선택 — 미구성이면 로컬 계정 로그인.
  const samlIdpUrl = (process.env.PORTAL_SAML_IDP_SSO_URL ?? '').trim()
  const samlCert = (process.env.PORTAL_SAML_IDP_CERT ?? '').trim() || (process.env.PORTAL_SAML_IDP_CERT_FILE ?? '').trim()
  const samlSet = (samlIdpUrl ? 1 : 0) + (samlCert ? 1 : 0)

  return [
    {
      key: '세션 서명 키',
      // 프로덕션에서 기본/빈 키는 세션 위조 가능 — 경고. 개발 모드에서는 정상.
      level: SESSION_SECRET_IS_DEFAULT ? (prod ? 'warn' : 'info') : 'ok',
      value: SESSION_SECRET_IS_DEFAULT ? '개발 기본값' : '설정됨',
      detail: SESSION_SECRET_IS_DEFAULT
        ? 'SESSION_SECRET 미설정·빈값 — 프로덕션은 기동 거부(세션 위조 방지), 랜덤 키 필수'
        : 'SESSION_SECRET 로 서명 — 세션 위조 차단',
    },
    {
      key: '영속화',
      level: dataFile ? 'ok' : 'warn',
      value: dataFile ? '파일' : '인메모리',
      detail: dataFile ? `PORTAL_DATA_FILE=${dataFile}` : '재시작 시 시드로 초기화 — 실배포는 PORTAL_DATA_FILE 설정',
    },
    {
      key: '알림 스케줄러',
      level: Number.isFinite(notify) && notify >= 1000 ? 'ok' : 'info',
      value: Number.isFinite(notify) && notify >= 1000 ? `가동 (${notify}ms)` : '수동',
      detail: Number.isFinite(notify) && notify >= 1000
        ? '일일 안내메일·백업 자동 실행'
        : 'PORTAL_NOTIFY_INTERVAL_MS 미설정 — 연동·인프라 화면 수동 실행만',
    },
    {
      key: 'HTTPS 쿠키',
      // 프로덕션에서 Secure 미설정이면 세션 쿠키가 평문으로 샐 수 있다 — 세션 키와 동등하게 경고로 노출.
      level: cookieSecure ? 'ok' : (prod ? 'warn' : 'info'),
      value: cookieSecure ? 'Secure' : '미설정',
      detail: cookieSecure ? '세션 쿠키 Secure 속성' : 'HTTPS 종단 배포면 PORTAL_COOKIE_SECURE=1 권장',
    },
    {
      key: '연동 어댑터',
      // 활성 전량 실=ok, 일부라도 목업=warn(실 배포 전 교체), 활성 채널 없음=info.
      level: adActive === 0 ? 'info' : adMock === 0 ? 'ok' : 'warn',
      value: adActive === 0 ? '활성 채널 없음' : `실 ${adReal} / 활성 ${adActive}${adMock ? ` · 목업 ${adMock}` : ''}`,
      detail: adActive === 0
        ? '활성 연동 채널 없음 — 프로필 채널 구성 확인'
        : adMock === 0
          ? '활성 채널 전량 실 어댑터 연결 — 실 발송·동기화·인증 동작'
          : adReal === 0
            ? '활성 채널 전량 목업 — 오프라인 데모 상태. 실 배포는 프로필 adapterId 를 실 어댑터로 교체'
            : `${adMock}개 채널 목업 — 해당 채널은 실제 발송·동기화 없음. 실 배포 전 실 어댑터 연결`,
    },
    {
      key: 'SSO(SAML)',
      // 둘 다=구성 완료(ok), 하나만=부분(로그인·검증 실패하므로 warn), 없음=선택 미사용(info·로컬 로그인).
      level: samlSet === 2 ? 'ok' : samlSet === 1 ? 'warn' : 'info',
      value: samlSet === 2 ? '구성됨' : samlSet === 1 ? '부분 구성' : '미구성 (로컬 로그인)',
      detail: samlSet === 2
        ? 'IdP SSO URL·서명 인증서 설정 — SP-initiated SSO 활성 (SP 메타데이터 /api/sso/metadata 임포트)'
        : samlSet === 1
          ? `SAML 설정 미완 — ${samlIdpUrl ? '서명 인증서(PORTAL_SAML_IDP_CERT[_FILE])' : 'IdP SSO URL(PORTAL_SAML_IDP_SSO_URL)'} 누락 시 로그인·검증 실패`
          : 'SAML 미설정 — 로컬 계정 로그인만. IdP 연동 시 PORTAL_SAML_IDP_SSO_URL·서명 인증서 주입',
    },
    {
      key: '고객사 프로필',
      level: 'info',
      value: profile,
      detail: 'PORTAL_PROFILE — 브랜딩·채널 바인딩 구성',
    },
  ]
}
