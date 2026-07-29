import { nowStamp } from './dates'
import { getStore } from './store'
import type { AuditLog } from './types'

/** 감사 로그 적재 — 문서번호 채번과 타임스탬프를 여기서만 만든다.
 *
 *  호출부마다 타임스탬프를 조립하면 고정 시각(`10:00:00` 등)이 섞여 들어가 시간순 정렬이
 *  깨진다. 감사 로그는 「감사 대응 자료」 리포트의 증빙 항목이므로 시각이 틀리면 증적으로서
 *  의미가 없어진다 — 실제로 그렇게 어긋나 있었고, 이 함수로 일원화해 재발을 막는다. */
export function appendAudit(entry: {
  actor: string
  action: string
  target: string
  result?: AuditLog['result']
  /** 접근 IP — 미지정 시 업무망 단말 대역 */
  ip?: string
}): void {
  const s = getStore()
  s.seq += 1
  s.auditLogs.unshift({
    id: `AUD-${9000 + s.seq}`,
    at: nowStamp(),
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    result: entry.result ?? '성공',
    ip: entry.ip ?? '10.20.31.45',
  })
}

/** 관리자 콘솔에서 수행한 정책 변경 — 접근 IP만 다르다 */
export function appendAdminAudit(actor: string, action: string, target: string): void {
  appendAudit({ actor, action, target, ip: '10.20.60.2' })
}
