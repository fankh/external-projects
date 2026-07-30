import { nowMinute } from './dates'
import { getStore } from './store'
import type { AiCallStatus } from './types'

/** AI 실제 가동 상태 — **키가 있다는 것과 AI가 동작한다는 것은 다르다**.
 *
 *  키만 보고 "AI 서술 생성" 이라 표시하면, 크레딧 소진·네트워크 차단·모델 접근 불가로 매번
 *  규칙 모드로 떨어지는 동안에도 화면은 AI 라고 주장하게 된다. 운영자는 그 사실을 리포트를
 *  생성해 mode 열을 봐야만 알 수 있다. 실제 호출 결과를 기록해 화면이 사실만 말하도록 한다. */
export function recordAiCall(ok: boolean, detail?: string): void {
  const s = getStore()
  s.aiLastCall = { at: nowMinute(), ok, detail }
}

export function aiStatus(): AiCallStatus {
  const key = Boolean(process.env.ANTHROPIC_API_KEY)
  const last = getStore().aiLastCall
  if (!key) return { state: '키 미설정', label: '규칙 기반 생성 — API 키 미설정', tone: 'neutral' }
  if (!last) return { state: '미검증', label: 'AI 키 설정됨 — 아직 호출 전(미검증)', tone: 'info' }
  if (last.ok) return { state: '가동', label: `AI 서술 생성 — 최근 성공 ${last.at}`, tone: 'ok' }
  return {
    state: '폴백',
    label: `규칙 기반 대체 — AI 호출 실패${last.detail ? ` (${last.detail})` : ''}`,
    tone: 'warn',
  }
}
