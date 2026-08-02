import type { SrStatus } from '@/lib/types'

export const SR_CHIP: Record<SrStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  작성중: 'neutral',
  결재중: 'info',
  CI배정: 'info',
  개발중: 'warn',
  테스트: 'warn',
  적용요청: 'warn',
  완료: 'ok',
  반려: 'err',
}
