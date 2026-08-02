import type { SrRequest, SrStatus } from '@/lib/types'

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

/** 데이터·계정/권한 SR 은 개발 단계가 없다 — '개발중' 상태를 '처리중'으로 표기한다 */
export function srStatusLabel(sr: Pick<SrRequest, 'kind' | 'status'>): string {
  return sr.status === '개발중' && sr.kind !== '시스템개발' ? '처리중' : sr.status
}
