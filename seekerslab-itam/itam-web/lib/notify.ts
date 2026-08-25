import { hasHolder } from './quality'
import { nowMinute } from './dates'
import { getStore } from './store'
import type { Dispatch } from './types'

/** 통지 수신자 표기 — 보유자가 있으면 '이름 (부서)', 없으면 관리 부서 앞으로 보낸다.
 *  보유자 자리에 '-'·'미지정' 같은 자리표시자가 그대로 실리면 '아무에게도 아닌 발송'이 되어 발송 이력만 남고
 *  아무도 읽지 않는다(유휴·검수중 자산의 통지가 그렇게 샜다). 수신자를 만드는 곳은 이 함수 하나로 모은다. */
export function recipientOf(owner: string | undefined, dept: string): string {
  const o = (owner ?? '').trim()
  return hasHolder(o) ? `${o} (${dept})` : dept
}

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
    deliveryStatus: '발송', // 배치·연동 서버 발송 성공(데모). 재발송도 이 경로로 성공 처리된다.
  }
  s.dispatches.unshift(row)
  return row
}

/** 긴급 보안 에스컬레이션 — 능동 위협 차단·격리·침해 대응처럼 즉시성이 중요한 통지는
 *  상세 근거를 이메일로, 즉시 알림을 문자(SMS)로 이중 발송한다(제품안내서 §06 이메일·문자 발송).
 *  이메일만으로는 야간·현장 대응이 지연되므로, 격리·차단·침해 같은 시간 임계 조치는 문자로도 즉시 알린다.
 *  두 발송 모두 이력에 남아 "즉시 통지했다"를 감사에서 증명한다. 반환: [이메일, 문자]. */
export function escalate(entry: {
  to: string
  subject: string
  kind: Dispatch['kind']
  ref?: string
  /** 문자용 짧은 알림 문구 (미지정 시 제목 사용). SMS 는 즉시성이 목적이라 핵심만 담는다. */
  sms?: string
  /** 문자 수신 대상 (미지정 시 이메일 수신처와 동일 — 보안 온콜) */
  smsTo?: string
}): Dispatch[] {
  const email = dispatch({ channel: '이메일', to: entry.to, subject: entry.subject, kind: entry.kind, ref: entry.ref })
  const sms = dispatch({ channel: '문자', to: entry.smsTo ?? entry.to, subject: `[긴급] ${entry.sms ?? entry.subject}`, kind: entry.kind, ref: entry.ref })
  return [email, sms]
}
