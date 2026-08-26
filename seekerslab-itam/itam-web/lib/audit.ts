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

/** 접근 거부 기록 — 권한 밖 화면 진입·문서 발급·반출 시도를 '결과=실패'로 남긴다.
 *
 *  감사 로그 화면과 반출 엑셀에는 '결과' 열과 '실패' 필터가 있고, 시드에도 「권한 밖 화면 접근 시도」가
 *  한 줄 들어 있다. 그런데 실제로 그런 행을 만드는 코드가 어디에도 없었다 — 화면 가드는 조용히
 *  대시보드로 돌려보내고, 문서·반출 API 는 조용히 403 을 던졌다. 운영 중에는 실패 행이 절대 늘지 않으니
 *  '누가 권한 밖을 두드렸는가'라는 감사 질문에 답할 수 없었다(시드 한 줄이 기능이 있다고 주장할 뿐이다).
 *
 *  같은 사람이 같은 대상을 같은 날 여러 번 두드려도 한 건만 남긴다 — 리다이렉트가 걸린 화면은 새로고침·
 *  뒤로가기로 쉽게 수십 번 반복되고, 그대로 쌓으면 정작 봐야 할 변경 이력이 거부 로그에 덮인다
 *  (독촉·통지의 '오늘 이미 보냈다'와 같은 규약). */
export function appendDenial(entry: { actor: string; action: string; target: string; ip?: string }): void {
  const s = getStore()
  const day = nowStamp().slice(0, 10)
  const dup = s.auditLogs.some(
    (l) => l.result === '실패' && l.actor === entry.actor && l.action === entry.action && l.target === entry.target && l.at.startsWith(day),
  )
  if (dup) return
  appendAudit({ ...entry, result: '실패' })
}

/** 권한 밖 문서·반출 요청을 감사에 남기고 403 을 돌려준다 — API 마다 따로 적으면 어느 하나가 빠진다.
 *  actor 는 로그인한 사람만 남긴다(미로그인은 401 이고 신원이 없다). */
export function forbidden(actor: string, action: string, target: string): Response {
  appendDenial({ actor, action, target })
  return new Response('Forbidden', { status: 403 })
}

/** 권한 밖 변경 시도를 감사에 남기고 거부 응답을 돌려준다 — 서버 액션판 forbidden().
 *  액션마다 거부 이유를 손으로 적어 두면 어느 하나가 빠지므로, 기록과 응답을 한 줄로 묶는다.
 *  target 은 그 액션이 속한 화면 경로다(감사 로그의 대상 열이 '어디서'를 답한다). */
export function denied(actor: string, message: string, target: string): { ok: false; message: string } {
  appendDenial({ actor, action: `권한 밖 변경 시도 — ${message}`, target })
  return { ok: false, message }
}
