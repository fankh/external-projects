/** REST 메시징 어댑터 — 목업을 넘어선 실동작 구현.
 *
 *  제품안내서 §V·요구사항 기타작업: 메일은 그룹웨어(Knox) REST API, 문자는 홈페이지 서버 REST API 로
 *  발송한다. 이 어댑터는 설정된 엔드포인트로 실제 HTTP POST 를 보내고 응답을 SendResult 로 매핑한다.
 *  엔드포인트·인증·발신자는 배포 환경변수로 주입하므로(하드코딩 없음) 고객사별로 재빌드 없이 전환된다.
 *
 *  계약(registry.sendVia·conformance 와의 정합):
 *   · 수신자 0명 → 네트워크 호출 없이 { ok:true }. (자가진단이 send([]) 로 호출하므로 엔드포인트 없이도
 *     계약 통과 — 실제 발송 경로는 수신자가 있을 때만 탄다.)
 *   · 엔드포인트 미설정 → 네트워크 호출 없이 { ok:false, detail } (throw 하지 않음 — 설정 누락은 소프트 실패).
 *   · 비정상 응답(비 2xx) → { ok:false, detail: 'HTTP <status>' } (소프트 실패).
 *   · 네트워크·인증 예외 → throw. registry.sendVia 의 try/catch 가 실패 이력으로 흡수한다.
 *   · 자체 타임아웃 없음 — registry.withTimeout 이 모든 어댑터 호출을 감싼다. */
import type { MessagingAdapter, SendResult } from './types'

interface RestChannelEnv {
  /** 발송 엔드포인트 URL (예: https://knox.example/api/v1/mail) */
  urlKey: string
  /** Bearer 토큰(선택) */
  tokenKey: string
  /** 발신자 주소·번호(선택) */
  fromKey: string
  /** 발송 이력 라벨 */
  label: string
}

const MAIL_ENV: RestChannelEnv = { urlKey: 'PORTAL_MAIL_API_URL', tokenKey: 'PORTAL_MAIL_API_TOKEN', fromKey: 'PORTAL_MAIL_FROM', label: '메일' }
const SMS_ENV: RestChannelEnv = { urlKey: 'PORTAL_SMS_API_URL', tokenKey: 'PORTAL_SMS_API_TOKEN', fromKey: 'PORTAL_SMS_FROM', label: '문자' }

/** 환경변수는 호출 시점에 읽는다 — 배포·테스트가 프로세스 기동 후 주입해도 반영되도록. */
function restMessaging(cfg: RestChannelEnv): MessagingAdapter {
  return {
    async send(to: string[], subject: string): Promise<SendResult> {
      const recipients = [...new Set(to.filter((t) => typeof t === 'string' && t.trim().length > 0))]
      // 수신자 0명 — 실제 발송할 대상이 없으면 네트워크 호출 없이 성공(무발송). 자가진단 send([]) 경로.
      if (recipients.length === 0) return { ok: true, detail: `${cfg.label} 수신자 0건 — 발송 생략` }

      const url = (process.env[cfg.urlKey] ?? '').trim()
      if (!url) return { ok: false, detail: `${cfg.label} 엔드포인트 미설정 (${cfg.urlKey})` }

      const token = (process.env[cfg.tokenKey] ?? '').trim()
      const from = (process.env[cfg.fromKey] ?? '').trim()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      // 실제 HTTP POST — 네트워크·인증 예외는 throw 되어 sendVia 가 흡수한다.
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: recipients, subject, from }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, detail: `${cfg.label} API HTTP ${res.status}${body ? ` — ${body.slice(0, 80)}` : ''}` }
      }
      // 응답에 수락/실패 건수가 있으면 반영(게이트웨이별 상이) — 없으면 요청 건수로 기록.
      let accepted = recipients.length
      try {
        const j = (await res.clone().json()) as { accepted?: unknown; sent?: unknown }
        const n = typeof j.accepted === 'number' ? j.accepted : typeof j.sent === 'number' ? j.sent : null
        if (n != null && Number.isFinite(n)) accepted = n
      } catch { /* 비 JSON 응답 — 요청 건수로 기록 */ }
      return { ok: true, detail: `${cfg.label} ${accepted}/${recipients.length}건 발송 (HTTP ${res.status})` }
    },
  }
}

/** 그룹웨어 메일(REST) — PORTAL_MAIL_API_URL 등으로 설정 */
export const restMail: MessagingAdapter = restMessaging(MAIL_ENV)

/** 문자(SMS, REST) — PORTAL_SMS_API_URL 등으로 설정 */
export const restSms: MessagingAdapter = restMessaging(SMS_ENV)
