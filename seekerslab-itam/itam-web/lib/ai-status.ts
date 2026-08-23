import { addDays, nowMinute } from './dates'
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
/** AI 감사 로그 선별 — 제안·질의·응답 판정에 더해 보존 기간(auditRetentionDays)까지 여기서 적용한다.
 *  그동안 보존 일수는 화면·리포트에 숫자로만 찍히고 실제로 아무 데도 쓰이지 않았다 — 정책은 '90일 보존'이라
 *  말하는데 화면은 300일 전 로그도 그대로 보여주는 식으로, 표시와 강제가 갈렸다(이 코드베이스가 반복해서
 *  닫아 온 계열). 보존이 지난 항목은 감사 화면에서 뺀다. 물리 삭제·아카이브는 배치 소관이며(발송 이력의
 *  '실제 전송은 배치 서버 소관'과 같은 경계) 여기서는 조회 범위를 정책에 맞춘다. */
export function aiAuditLogs<T extends { at: string; actor: string; action: string; target: string }>(
  logs: T[],
  retentionDays: number,
  today: string,
): T[] {
  const cutoff = addDays(today, -Math.max(0, retentionDays))
  return logs.filter((l) => {
    const isAi = l.actor === 'AI 서비스' || l.target === 'AI 정책' || l.target === 'AI 어시스턴트' || l.action.startsWith('AI 제안')
    return isAi && l.at.slice(0, 10) >= cutoff
  })
}
