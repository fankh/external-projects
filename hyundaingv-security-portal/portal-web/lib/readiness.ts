/** 배포 준비 상태 — 실배포 전 확인해야 할 런타임 구성 신호를 한곳에 모은다.
 *  연동·인프라 화면(ADMIN)에 카드로 노출한다. 어댑터 계약 자가진단(conformance)과 짝을 이뤄,
 *  운영자가 새 고객사 배포 시 "프로덕션 준비됐는가"를 한눈에 본다. */
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

  return [
    {
      key: '세션 서명 키',
      // 프로덕션에서 기본/빈 키는 세션 위조 가능 — 경고. 개발 모드에서는 정상.
      level: SESSION_SECRET_IS_DEFAULT ? (prod ? 'warn' : 'info') : 'ok',
      value: SESSION_SECRET_IS_DEFAULT ? '개발 기본값' : '설정됨',
      detail: SESSION_SECRET_IS_DEFAULT
        ? 'SESSION_SECRET 미설정·빈값 — 프로덕션에서는 세션 위조 가능, 랜덤 키 필수'
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
      level: cookieSecure ? 'ok' : 'info',
      value: cookieSecure ? 'Secure' : '미설정',
      detail: cookieSecure ? '세션 쿠키 Secure 속성' : 'HTTPS 종단 배포면 PORTAL_COOKIE_SECURE=1 권장',
    },
    {
      key: '고객사 프로필',
      level: 'info',
      value: profile,
      detail: 'PORTAL_PROFILE — 브랜딩·채널 바인딩 구성',
    },
  ]
}
