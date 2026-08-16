import type { SrStatus } from '@/lib/types'

export const SR_CHIP: Record<SrStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  작성중: 'neutral',
  결재중: 'info',
  CI배정: 'info',
  개발중: 'warn',
  테스트: 'warn',
  적용요청결재중: 'info',
  적용요청: 'warn',
  완료: 'ok',
  반려: 'err',
  중지: 'neutral',
}

/** SR 상태 라벨은 SR 도메인 단일 원천(lib/sr)으로 이관 — 화면·export 가 같은 규칙을 공유한다.
 *  기존 소비처(../chips import)를 위해 재수출한다. */
export { srStatusLabel } from '@/lib/sr'
