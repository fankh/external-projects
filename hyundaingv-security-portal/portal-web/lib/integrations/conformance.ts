/** 어댑터 계약 적합성 자가진단 — 재사용 프레임워크의 launch 게이트.
 *  두 가지를 검증한다:
 *   1) 바인딩 완결성 — 모든 프로필의 '연동 예정' 아닌 채널이 레지스트리에 실제 어댑터로 해석된다
 *      (adapterId 오타·미등록이 런타임 무동작으로 새는 것을 사전 차단).
 *   2) 계약 적합성 — 해석된 어댑터를 실제로 호출해 반환 형태·불변식을 확인한다
 *      (고객사 어댑터를 스테이징 투입 전에 이 진단으로 통과시키면 계약 위반을 조기 발견).
 *  포털 본체가 아니라 연동 계약 자체를 검증하므로, 새 고객사 어댑터의 착수 조건 도구다. */
import * as defaultProfile from '@/profiles/default.config'
import * as manufacturerProfile from '@/profiles/sample-manufacturer.config'
import { resolveAdapter } from './registry'
import type { ChannelBinding } from './types'

export interface ConformanceCheck {
  profile: string
  channel: string
  adapterId: string
  area: '바인딩' | '계약'
  ok: boolean
  detail: string
}

const PROFILES: { name: string; channels: ChannelBinding[] }[] = [
  { name: 'default', channels: defaultProfile.CHANNELS },
  { name: 'manufacturer', channels: manufacturerProfile.CHANNELS },
]

/** 계약이 정의된 kind — approval·sso 는 아직 계약(인터페이스)이 없어 planned 로만 존재한다 */
const CONTRACTED = new Set(['mail', 'sms', 'hr', 'asset', 'secdata'])

function isPerson(x: unknown): x is { name: string; dept: string } {
  return !!x && typeof (x as { name?: unknown }).name === 'string' && typeof (x as { dept?: unknown }).dept === 'string'
}

/** 해석된 어댑터를 호출해 계약 불변식을 확인한다 (부작용 없는 조회·발송만 사용) */
async function exerciseContract(kind: string, adapter: unknown): Promise<{ ok: boolean; detail: string }> {
  try {
    if (kind === 'mail' || kind === 'sms') {
      const r = await (adapter as { send: (t: string[], s: string) => Promise<{ ok: boolean; detail: string }> }).send([], '자가진단')
      if (typeof r?.ok !== 'boolean' || typeof r?.detail !== 'string') return { ok: false, detail: 'send() 가 {ok,detail} 를 반환하지 않음' }
      return { ok: true, detail: `send() → ok=${r.ok}` }
    }
    if (kind === 'hr') {
      const people = await (adapter as { fetchPeople: () => Promise<unknown[]> }).fetchPeople()
      if (!Array.isArray(people) || people.length === 0) return { ok: false, detail: 'fetchPeople() 가 비어있거나 배열 아님' }
      if (!people.every(isPerson)) return { ok: false, detail: 'fetchPeople() 항목이 {name,dept} 형태 아님' }
      return { ok: true, detail: `fetchPeople() → ${people.length}명` }
    }
    if (kind === 'asset') {
      const a = adapter as { searchAssets: (q: string) => Promise<{ serial: string; assetNo?: string }[]>; acquireAssetNo: (s: string) => Promise<{ assetNo: string }> }
      const rows = await a.searchAssets('')
      if (!Array.isArray(rows)) return { ok: false, detail: 'searchAssets() 가 배열 아님' }
      // acquireAssetNo 는 신규 자산에 번호를 부여하며 상태를 바꾼다 — 자가진단은 부작용 없이,
      // 이미 등록번호가 있는 자산으로 멱등 경로만 확인한다 (없으면 조회 형태만 검증).
      const registered = rows.find((r) => typeof r.serial === 'string' && typeof r.assetNo === 'string' && r.assetNo.length > 0)
      if (registered) {
        const acq = await a.acquireAssetNo(registered.serial)
        if (!acq || typeof acq.assetNo !== 'string' || acq.assetNo.length === 0) return { ok: false, detail: 'acquireAssetNo() 가 비어있지 않은 assetNo 를 반환하지 않음' }
        return { ok: true, detail: `searchAssets() ${rows.length}건 · acquireAssetNo(멱등) → ${acq.assetNo}` }
      }
      return { ok: true, detail: `searchAssets() ${rows.length}건 (등록 자산 없어 acquire 스킵)` }
    }
    if (kind === 'secdata') {
      const rows = await (adapter as { fetchPrintouts: () => Promise<unknown[]> }).fetchPrintouts()
      if (!Array.isArray(rows)) return { ok: false, detail: 'fetchPrintouts() 가 배열 아님' }
      const shaped = rows.every((r) => {
        const x = r as { printedAt?: unknown; name?: unknown; document?: unknown; pages?: unknown }
        return typeof x.printedAt === 'string' && typeof x.name === 'string' && typeof x.document === 'string' && typeof x.pages === 'number'
      })
      if (!shaped) return { ok: false, detail: 'fetchPrintouts() 항목 형태 불일치' }
      return { ok: true, detail: `fetchPrintouts() → ${rows.length}건` }
    }
    return { ok: true, detail: 'kind 계약 없음(스킵)' }
  } catch (e) {
    return { ok: false, detail: `호출 예외: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 전 프로필 × 전 채널 자가진단 — 실패가 하나라도 있으면 프레임워크 배포를 막아야 한다 */
export async function runAdapterConformance(): Promise<ConformanceCheck[]> {
  const checks: ConformanceCheck[] = []
  for (const { name, channels } of PROFILES) {
    for (const ch of channels) {
      if (ch.planned || !CONTRACTED.has(ch.kind)) continue
      const adapter = resolveAdapter(ch.kind, ch.adapterId)
      if (!adapter) {
        checks.push({ profile: name, channel: ch.name, adapterId: ch.adapterId, area: '바인딩', ok: false, detail: `adapterId '${ch.adapterId}' 가 레지스트리에 없음 — 런타임 무동작` })
        continue
      }
      checks.push({ profile: name, channel: ch.name, adapterId: ch.adapterId, area: '바인딩', ok: true, detail: '레지스트리 해석 성공' })
      const c = await exerciseContract(ch.kind, adapter)
      checks.push({ profile: name, channel: ch.name, adapterId: ch.adapterId, area: '계약', ok: c.ok, detail: c.detail })
    }
  }
  return checks
}
