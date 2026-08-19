/** 어댑터 레지스트리 — portal.config.ts 의 채널 바인딩을 어댑터 구현으로 해석한다.
 *  채널 활성 상태는 스토어(런타임)에 있고, 여기서는 정의·구현만 다룬다.
 *  발송·조회류 공통 규칙: 채널이 비활성이면 어댑터를 호출하지 않고 실패를 반환한다. */
import { CHANNELS } from '@/portal.config'
import { nowStamp } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { mockAsset, mockHr, mockMail, mockSecdata, mockSecmon, mockSms } from './mock'
import { restAsset, restHr, restMail, restSecdata, restSecmon, restSms } from './rest'
import type { AssetAdapter, ChannelBinding, HrAdapter, MessagingAdapter, SecdataAdapter, SecMonAdapter, SendResult } from './types'

/** 어댑터 호출 상한 시간 — 실 고객사 시스템이 응답 없이 매달리면(타임아웃 없는 fetch 등)
 *  포털 요청·스케줄러 틱이 무한 대기한다. 호출을 시간 상한으로 감싸 초과 시 reject 시키고,
 *  각 호출부의 기존 실패 분기(v1.5.16 try/catch)가 이를 흡수한다. 기본 10초,
 *  PORTAL_ADAPTER_TIMEOUT_MS 로 배포별 조정. 목 어댑터는 즉시 resolve 라 영향 없다. */
export function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  const raw = Number(process.env.PORTAL_ADAPTER_TIMEOUT_MS)
  const ms = Number.isFinite(raw) && raw > 0 ? raw : 10000
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`어댑터 응답 시간 초과(${ms}ms): ${label}`)), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
  })
}

/** adapterId → 구현. 고객사 어댑터를 추가하면 여기에 등록한다.
 *  데모 기본 프로필은 목업(mock-*)으로 오프라인 시연이 되게 두고, 샘플 고객사 프로필(제조·공공·금융)의
 *  메일·문자는 실동작 REST 어댑터(rest.ts)에 바인딩한다 — 요구사항의 실 전송 방식(REST API)과 일치하며,
 *  엔드포인트·인증은 배포 환경변수로 주입한다(PORTAL_MAIL_API_URL 등). rest-mail·rest-sms 는 새 프로필이
 *  직접 참조할 수 있는 범용 id. */
const MESSAGING: Record<string, MessagingAdapter> = {
  'mock-mail': mockMail,
  'mock-sms': mockSms,
  'rest-mail': restMail,
  'rest-sms': restSms,
  'hanbit-gw-mail': restMail,
  'gov-mail': restMail,
  'gov-sms': restSms,
  'fin-mail': restMail,
  'fin-sms': restSms,
}
// 데모 기본은 목업 유지(오프라인·결함주입 테스트). 샘플 고객사 프로필의 HR 은 실동작 REST 디렉터리 어댑터에
// 바인딩 — PORTAL_HR_API_URL 설정 시 실 HR API 조회, 미설정 시 부트스트랩 명단(자가진단 통과).
const HR: Record<string, HrAdapter> = { 'mock-hr': mockHr, 'rest-hr': restHr, 'hanbit-hr': restHr, 'gov-hr': restHr, 'fin-hr': restHr }
// 데모 기본은 목업 유지(오프라인·결함주입 테스트). 샘플 고객사 프로필의 자산은 실동작 REST 어댑터에 바인딩 —
// PORTAL_ASSET_API_URL 설정 시 실 자산 API 조회·PORTAL_ASSET_REGISTER_URL 로 등록번호 취득(쓰기 폐쇄 루프).
const ASSET: Record<string, AssetAdapter> = { 'mock-asset': mockAsset, 'rest-asset': restAsset, 'erp-asset': restAsset, 'gov-asset': restAsset, 'fin-asset': restAsset }
// 데모 기본은 목업 유지. 샘플 고객사 프로필의 출력물 자료는 실동작 REST 어댑터에 바인딩 —
// PORTAL_SECDATA_API_URL 설정 시 실 출력물 시스템(ESCORT·PRINTERCHASER류) 조회.
const SECDATA: Record<string, SecdataAdapter> = { 'mock-secdata': mockSecdata, 'rest-secdata': restSecdata, 'gov-secdata': restSecdata, 'fin-secdata': restSecdata }
// 데모 기본은 목업 유지(오프라인·결함주입 테스트). 샘플 고객사 프로필의 보안관제는 실동작 REST 어댑터에
// 바인딩 — PORTAL_SECMON_API_URL 설정 시 실 SIEM/DLP/EDR 탐지 이벤트 조회(→ 보안위반 자동 편입).
const SECMON: Record<string, SecMonAdapter> = { 'mock-secmon': mockSecmon, 'rest-secmon': restSecmon, 'gov-secmon': restSecmon, 'fin-secmon': restSecmon }

/** adapterId → 구현 해석 (kind 별) — 자가진단·바인딩 완결성 검사가 쓴다.
 *  활성 상태와 무관하게 '등록되어 있는가'만 본다 (계약 적합성은 별도). */
export function resolveAdapter(kind: string, adapterId: string): MessagingAdapter | HrAdapter | AssetAdapter | SecdataAdapter | SecMonAdapter | null {
  switch (kind) {
    case 'mail':
    case 'sms': return MESSAGING[adapterId] ?? null
    case 'hr': return HR[adapterId] ?? null
    case 'asset': return ASSET[adapterId] ?? null
    case 'secdata': return SECDATA[adapterId] ?? null
    case 'secmon': return SECMON[adapterId] ?? null
    default: return null
  }
}

export function channelOf(id: string): ChannelBinding | undefined {
  return CHANNELS.find((c) => c.id === id)
}

export function isEnabled(id: string): boolean {
  const st = getStore().channelStates
  return st[id] ?? channelOf(id)?.enabledByDefault ?? false
}

export function channelSummary(): { on: number; total: number } {
  // 실구현 예정(planned) 채널은 활성 집계에서 제외 — 실제 연동 범위만 보이게 한다
  const real = CHANNELS.filter((c) => !c.planned)
  return { on: real.filter((c) => isEnabled(c.id)).length, total: real.length }
}

/** 메일·문자 발송 — 발송 이력을 스토어에 남긴다 (연동·인프라 화면에서 추적) */
export async function sendVia(channelId: string, to: string[], subject: string): Promise<SendResult> {
  const ch = channelOf(channelId)
  const adapter = ch && MESSAGING[ch.adapterId]
  const s = getStore()
  let result: SendResult
  if (!ch || !adapter) {
    result = { ok: false, detail: `미등록 채널: ${channelId}` }
  } else if (!isEnabled(channelId)) {
    result = { ok: false, detail: `${ch.name} 채널 중지됨 — 발송 실패` }
  } else {
    // 실 어댑터(네트워크·인증·타임아웃)는 throw 할 수 있다 — 발송 예외를 실패 이력으로
    // 남기고 호출측(알림 배치 등)이 죽지 않게 한다. 목 어댑터는 throw 하지 않아 게이트만으론 못 잡음.
    try {
      // 실 어댑터가 계약(SendResult)을 어겨 undefined·비객체를 resolve 하면 아래 s.sendLog 의 result.ok/
      // result.detail 접근이 try 밖에서 TypeError→500(발송 예외 흡수의 사각). resolve 값 형태를 검증해
      // SendResult 로 정규화한다(throw·hang 은 withTimeout·catch 가, 오형 resolve 는 이 검증이 담당).
      const r = await withTimeout(adapter.send(to, subject), `${ch.name} 발송`)
      result = r && typeof r.ok === 'boolean'
        ? { ok: r.ok, detail: typeof r.detail === 'string' ? r.detail : '' }
        : { ok: false, detail: `${ch.name} 발송 응답 형태 오류(SendResult 계약 위반)` }
    } catch (e) {
      result = { ok: false, detail: `${ch.name} 발송 예외: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) }
    }
  }
  s.sendLog.unshift({ channelId, to: to.length, subject, ok: result.ok, detail: result.detail, at: nowStamp() })
  if (s.sendLog.length > 200) s.sendLog.length = 200
  return result
}

export function hrAdapter(): HrAdapter | null {
  // 조회류 공통 규칙(파일 상단) — 채널 비활성이면 어댑터를 넘기지 않는다. asset·secdata 리졸버와 대칭.
  // 현재 유일 호출부(syncHr)가 isEnabled 를 따로 보지만, 리졸버가 자체 게이트해야 향후 호출부가 검사를
  // 빠뜨려도 중지된 채널의 실 어댑터를 호출하지 않는다(운영자 채널 토글 계약 준수).
  const ch = channelOf('hr-sync')
  if (!ch || !isEnabled('hr-sync')) return null
  return HR[ch.adapterId] ?? null
}

export function assetAdapter(): AssetAdapter | null {
  const ch = channelOf('asset-api')
  if (!ch || !isEnabled('asset-api')) return null
  return ASSET[ch.adapterId] ?? null
}

export function secdataAdapter(): SecdataAdapter | null {
  const ch = channelOf('security-db')
  if (!ch || !isEnabled('security-db')) return null
  return SECDATA[ch.adapterId] ?? null
}

export function secmonAdapter(): SecMonAdapter | null {
  // 조회류 공통 규칙 — 채널 비활성이면 어댑터를 넘기지 않는다 (hr·asset·secdata 리졸버와 대칭).
  const ch = channelOf('sec-monitor')
  if (!ch || !isEnabled('sec-monitor')) return null
  return SECMON[ch.adapterId] ?? null
}
