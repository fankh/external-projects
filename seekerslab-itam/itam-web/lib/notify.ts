import { nowMinute } from './dates'
import { getStore } from './store'
import type { Dispatch } from './types'

/** 알림 발송 — 그룹웨어 메일·문자 채널로 나가는 통지의 단일 진입점.
 *  실제 전송은 배치·연동 서버 소관이므로 여기서는 발송 이력만 적재한다.
 *  이력을 남기지 않으면 "발송했다"는 주장을 감사에서 증명할 수 없다. */
export function dispatch(entry: {
  channel: Dispatch['channel']
  to: string
  subject: string
  kind: Dispatch['kind']
  ref?: string
}): Dispatch {
  const s = getStore()
  s.seq += 1
  const row: Dispatch = {
    id: `MSG-${4000 + s.seq}`,
    at: nowMinute(),
    channel: entry.channel,
    to: entry.to,
    subject: entry.subject,
    kind: entry.kind,
    ref: entry.ref,
  }
  s.dispatches.unshift(row)
  return row
}
