/** 어댑터 레지스트리 — portal.config.ts 의 채널 바인딩을 어댑터 구현으로 해석한다.
 *  채널 활성 상태는 스토어(런타임)에 있고, 여기서는 정의·구현만 다룬다.
 *  발송·조회류 공통 규칙: 채널이 비활성이면 어댑터를 호출하지 않고 실패를 반환한다. */
import { CHANNELS } from '@/portal.config'
import { nowStamp } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { mockAsset, mockHr, mockMail, mockSms } from './mock'
import type { AssetAdapter, ChannelBinding, HrAdapter, MessagingAdapter, SendResult } from './types'

/** adapterId → 구현. 고객사 어댑터를 추가하면 여기에 등록한다. */
const MESSAGING: Record<string, MessagingAdapter> = {
  'mock-mail': mockMail,
  'mock-sms': mockSms,
}
const HR: Record<string, HrAdapter> = { 'mock-hr': mockHr }
const ASSET: Record<string, AssetAdapter> = { 'mock-asset': mockAsset }

export function channelOf(id: string): ChannelBinding | undefined {
  return CHANNELS.find((c) => c.id === id)
}

export function isEnabled(id: string): boolean {
  const st = getStore().channelStates
  return st[id] ?? channelOf(id)?.enabledByDefault ?? false
}

export function channelSummary(): { on: number; total: number } {
  return { on: CHANNELS.filter((c) => isEnabled(c.id)).length, total: CHANNELS.length }
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
