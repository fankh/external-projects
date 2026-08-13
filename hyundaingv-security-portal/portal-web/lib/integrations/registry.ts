/** 어댑터 레지스트리 — portal.config.ts 의 채널 바인딩을 어댑터 구현으로 해석한다.
 *  채널 활성 상태는 스토어(런타임)에 있고, 여기서는 정의·구현만 다룬다.
 *  발송·조회류 공통 규칙: 채널이 비활성이면 어댑터를 호출하지 않고 실패를 반환한다. */
import { CHANNELS } from '@/portal.config'
import { nowStamp } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { mockAsset, mockHr, mockMail, mockSecdata, mockSms } from './mock'
import type { AssetAdapter, ChannelBinding, HrAdapter, MessagingAdapter, SecdataAdapter, SendResult } from './types'

/** adapterId → 구현. 고객사 어댑터를 추가하면 여기에 등록한다.
 *  hanbit-*·erp-* 는 제조업 예시 프로필용 — 데모에서는 목업에 매핑되고,
 *  실배포에서 고객사 구현으로 교체한다. */
const MESSAGING: Record<string, MessagingAdapter> = {
  'mock-mail': mockMail,
  'mock-sms': mockSms,
  'hanbit-gw-mail': mockMail,
  'gov-mail': mockMail,
  'gov-sms': mockSms,
}
const HR: Record<string, HrAdapter> = { 'mock-hr': mockHr, 'hanbit-hr': mockHr, 'gov-hr': mockHr }
const ASSET: Record<string, AssetAdapter> = { 'mock-asset': mockAsset, 'erp-asset': mockAsset, 'gov-asset': mockAsset }
const SECDATA: Record<string, SecdataAdapter> = { 'mock-secdata': mockSecdata, 'gov-secdata': mockSecdata }

/** adapterId → 구현 해석 (kind 별) — 자가진단·바인딩 완결성 검사가 쓴다.
 *  활성 상태와 무관하게 '등록되어 있는가'만 본다 (계약 적합성은 별도). */
export function resolveAdapter(kind: string, adapterId: string): MessagingAdapter | HrAdapter | AssetAdapter | SecdataAdapter | null {
  switch (kind) {
    case 'mail':
    case 'sms': return MESSAGING[adapterId] ?? null
    case 'hr': return HR[adapterId] ?? null
    case 'asset': return ASSET[adapterId] ?? null
    case 'secdata': return SECDATA[adapterId] ?? null
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
    result = await adapter.send(to, subject)
  }
  s.sendLog.unshift({ channelId, to: to.length, subject, ok: result.ok, detail: result.detail, at: nowStamp() })
  if (s.sendLog.length > 200) s.sendLog.length = 200
  return result
}

export function hrAdapter(): HrAdapter | null {
  const ch = channelOf('hr-sync')
  return ch ? HR[ch.adapterId] ?? null : null
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
