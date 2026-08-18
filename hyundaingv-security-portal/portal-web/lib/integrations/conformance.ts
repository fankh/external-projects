/** 어댑터 계약 적합성 자가진단 — 재사용 프레임워크의 launch 게이트.
 *  두 가지를 검증한다:
 *   1) 바인딩 완결성 — 모든 프로필의 '연동 예정' 아닌 채널이 레지스트리에 실제 어댑터로 해석된다
 *      (adapterId 오타·미등록이 런타임 무동작으로 새는 것을 사전 차단).
 *   2) 계약 적합성 — 해석된 어댑터를 실제로 호출해 반환 형태·불변식을 확인한다
 *      (고객사 어댑터를 스테이징 투입 전에 이 진단으로 통과시키면 계약 위반을 조기 발견).
 *  포털 본체가 아니라 연동 계약 자체를 검증하므로, 새 고객사 어댑터의 착수 조건 도구다. */
import { ALL_PROFILES } from '@/profiles/registry'
import { resolveAdapter, withTimeout } from './registry'
import type { ChannelBinding, ChannelKind, PortalBrand } from './types'

export interface ConformanceCheck {
  profile: string
  channel: string
  adapterId: string
  area: '구조' | '바인딩' | '계약'
  ok: boolean
  detail: string
}

// 전 프로필을 registry(단일 원천)에서 파생 — 새 고객사 프로필을 registry 에 올리면
// 런타임 선택과 자가진단이 함께 반영된다(진단 목록을 따로 관리하지 않는다).
const PROFILES: { name: string; brand: PortalBrand; channels: ChannelBinding[] }[] =
  Object.entries(ALL_PROFILES).map(([name, p]) => ({ name, brand: p.PORTAL, channels: p.CHANNELS }))

const KINDS = new Set<ChannelKind>(['mail', 'sms', 'approval', 'sso', 'hr', 'asset', 'secdata', 'secmon'])
const TRANSPORTS = new Set(['REST API', 'SAML', 'DB 연계', '인터페이스'])

/** 프로필 구조 검증 — 고객사가 프로필을 추가/편집할 때의 정합성 (어댑터 해석과 별개).
 *  중복 채널 id·미정의 kind·빈 필드 등을 배포 전에 잡는다. */
export function validateProfileStructure(name: string, brand: PortalBrand, channels: ChannelBinding[]): ConformanceCheck[] {
  const out: ConformanceCheck[] = []
  const push = (ok: boolean, detail: string, channel = '(프로필)', adapterId = '-') =>
    out.push({ profile: name, channel, adapterId, area: '구조', ok, detail })

  // 브랜딩 필드 비어있지 않음
  const brandOk = (['customer', 'productName', 'productSub', 'version'] as const).every((k) => typeof brand[k] === 'string' && brand[k].trim().length > 0)
  push(brandOk, brandOk ? '브랜딩 4필드 채워짐' : '브랜딩 필드(customer/productName/productSub/version) 누락')

  push(channels.length > 0, channels.length > 0 ? `채널 ${channels.length}개` : '채널이 하나도 없음')

  // 채널 id 유일성
  const ids = channels.map((c) => c.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  push(!dup, dup ? `채널 id 중복: ${dup}` : '채널 id 유일')

  for (const c of channels) {
    const problems: string[] = []
    if (!c.id?.trim()) problems.push('id 빈값')
    if (!KINDS.has(c.kind)) problems.push(`kind '${c.kind}' 미정의`)
    if (!c.name?.trim()) problems.push('name 빈값')
    if (!c.adapterId?.trim()) problems.push('adapterId 빈값')
    if (!TRANSPORTS.has(c.transport)) problems.push(`transport '${c.transport}' 미정의`)
    push(problems.length === 0, problems.length === 0 ? '필드 정합' : problems.join(', '), c.name || c.id, c.adapterId || '-')
  }
  return out
}

/** 계약이 정의된 kind — approval·sso 는 아직 계약(인터페이스)이 없어 planned 로만 존재한다 */
const CONTRACTED = new Set(['mail', 'sms', 'hr', 'asset', 'secdata', 'secmon'])

function isPerson(x: unknown): x is { name: string; dept: string } {
  return !!x && typeof (x as { name?: unknown }).name === 'string' && typeof (x as { dept?: unknown }).dept === 'string'
}

/** 보안관제 이벤트 형태 — 5필드 문자열. type 의 코드 멤버십(ViolationType)은 import 액션이 검증한다(shape vs code 계층 분리). */
function isSecurityEvent(x: unknown): boolean {
  const e = x as { name?: unknown; dept?: unknown; type?: unknown; detail?: unknown; detectedAt?: unknown }
  return typeof e?.name === 'string' && typeof e?.dept === 'string' && typeof e?.type === 'string'
    && typeof e?.detail === 'string' && typeof e?.detectedAt === 'string'
}

/** 해석된 어댑터를 호출해 계약 불변식을 확인한다 (부작용 없는 조회·발송만 사용) */
async function exerciseContract(kind: string, adapter: unknown): Promise<{ ok: boolean; detail: string }> {
  try {
    if (kind === 'mail' || kind === 'sms') {
      const r = await withTimeout((adapter as { send: (t: string[], s: string) => Promise<{ ok: boolean; detail: string }> }).send([], '자가진단'), '자가진단 send')
      if (typeof r?.ok !== 'boolean' || typeof r?.detail !== 'string') return { ok: false, detail: 'send() 가 {ok,detail} 를 반환하지 않음' }
      return { ok: true, detail: `send() → ok=${r.ok}` }
    }
    if (kind === 'hr') {
      const people = await withTimeout((adapter as { fetchPeople: () => Promise<unknown[]> }).fetchPeople(), '자가진단 fetchPeople')
      if (!Array.isArray(people) || people.length === 0) return { ok: false, detail: 'fetchPeople() 가 비어있거나 배열 아님' }
      if (!people.every(isPerson)) return { ok: false, detail: 'fetchPeople() 항목이 {name,dept} 형태 아님' }
      return { ok: true, detail: `fetchPeople() → ${people.length}명` }
    }
    if (kind === 'asset') {
      const a = adapter as { searchAssets: (q: string) => Promise<{ serial: string; assetNo?: string }[]>; acquireAssetNo: (s: string) => Promise<{ assetNo: string }> }
      const rows = await withTimeout(a.searchAssets(''), '자가진단 searchAssets')
      if (!Array.isArray(rows)) return { ok: false, detail: 'searchAssets() 가 배열 아님' }
      // 항목 형태 검증 — hr·secdata 와 동일 엄격도(ExternalAsset {serial,model,category,holder:string}).
      // 이게 없으면 등록 자산이 없는 그린필드에서 malformed 행도 '적합'으로 통과(false-clean)해 실 배포 크래시.
      // assetNo(옵셔널)도 검증 — 화면이 {a.assetNo} 직접 렌더하므로 객체값이면 실 배포에서 전 화면 500 인데
      // 이 검사가 빠지면 자가진단은 녹색 통과한다(asset-reg 수집 필터와 동조).
      if (!rows.every((r) => {
        const x = r as { serial?: unknown; model?: unknown; category?: unknown; holder?: unknown; assetNo?: unknown }
        return typeof x.serial === 'string' && typeof x.model === 'string' && typeof x.category === 'string' && typeof x.holder === 'string'
          && (x.assetNo == null || typeof x.assetNo === 'string')
      })) return { ok: false, detail: 'searchAssets() 항목이 {serial,model,category,holder,assetNo?:string} 형태 아님' }
      // acquireAssetNo 는 신규 자산에 번호를 부여하며 상태를 바꾼다 — 자가진단은 부작용 없이,
      // 이미 등록번호가 있는 자산으로 멱등 경로만 확인한다 (없으면 조회 형태만 검증).
      const registered = rows.find((r) => typeof r.serial === 'string' && typeof r.assetNo === 'string' && r.assetNo.length > 0)
      if (registered) {
        const acq = await withTimeout(a.acquireAssetNo(registered.serial), '자가진단 acquireAssetNo')
        if (!acq || typeof acq.assetNo !== 'string' || acq.assetNo.length === 0) return { ok: false, detail: 'acquireAssetNo() 가 비어있지 않은 assetNo 를 반환하지 않음' }
        return { ok: true, detail: `searchAssets() ${rows.length}건 · acquireAssetNo(멱등) → ${acq.assetNo}` }
      }
      return { ok: true, detail: `searchAssets() ${rows.length}건 (등록 자산 없어 acquire 스킵)` }
    }
    if (kind === 'secdata') {
      const rows = await withTimeout((adapter as { fetchPrintouts: () => Promise<unknown[]> }).fetchPrintouts(), '자가진단 fetchPrintouts')
      if (!Array.isArray(rows)) return { ok: false, detail: 'fetchPrintouts() 가 배열 아님' }
      // 필수 필드 전수 — dept 는 부서담당 행 스코핑(prints p.dept===me.dept), personalInfo 는 개인정보
      // 표시·엑셀 Y/N 에 소비된다(types.ts PrintoutSourceRow 필수). 이 둘을 빼면 이를 누락한 고객사 어댑터가
      // 자가진단은 녹색 통과하고 실 배포에서 부서 스코핑 누락·개인정보 오표기(undefined→미표시)로 이어진다.
      const shaped = rows.every((r) => {
        const x = r as { printedAt?: unknown; name?: unknown; document?: unknown; pages?: unknown; dept?: unknown; personalInfo?: unknown }
        return typeof x.printedAt === 'string' && typeof x.name === 'string' && typeof x.document === 'string'
          && typeof x.pages === 'number' && typeof x.dept === 'string' && typeof x.personalInfo === 'boolean'
      })
      if (!shaped) return { ok: false, detail: 'fetchPrintouts() 항목이 {printedAt,name,dept,document,pages,personalInfo} 형태 아님' }
      return { ok: true, detail: `fetchPrintouts() → ${rows.length}건` }
    }
    if (kind === 'secmon') {
      const rows = await withTimeout((adapter as { fetchEvents: () => Promise<unknown[]> }).fetchEvents(), '자가진단 fetchEvents')
      if (!Array.isArray(rows)) return { ok: false, detail: 'fetchEvents() 가 배열 아님' }
      // 필수 필드 전수 — name(위반자·수신자)·type(위반 유형)·dept(부서 스코핑)·detectedAt(발생일·중복키)·detail.
      // 누락하면 이를 뺀 고객사 어댑터가 자가진단 녹색 통과 후 실 배포에서 위반 자동등록이 유령·오형으로 샌다.
      if (!rows.every(isSecurityEvent)) return { ok: false, detail: 'fetchEvents() 항목이 {name,dept,type,detail,detectedAt} 형태 아님' }
      return { ok: true, detail: `fetchEvents() → ${rows.length}건` }
    }
    return { ok: true, detail: 'kind 계약 없음(스킵)' }
  } catch (e) {
    return { ok: false, detail: `호출 예외: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 검증기 자기점검 — 세 검사(구조·바인딩·계약)가 모두 '이빨이 있는지', 즉 일부러 깨뜨린
 *  입력을 실제로 부적합으로 잡아내는지 확인한다. 검증기가 항상 '적합'만 내는 무력화를 막는다
 *  (리팩터링으로 검사 로직이 조용히 약해지면 실 어댑터는 여전히 통과해 눈치채지 못하므로,
 *  각 검사가 거절해야 하는 케이스를 직접 먹여 본다). 자가진단 카드에 상태를 노출한다. */
export async function validatorSelfCheck(): Promise<{ ok: boolean; detail: string }> {
  // 1) 구조 검사 — 깨진 프로필(브랜딩 누락·id 중복·채널 다중결함)이 부적합으로 잡히는가
  const bad = validateProfileStructure(
    '__selftest__',
    { customer: '', productName: 'x', productSub: 'y', version: 'z' } as PortalBrand,
    [
      { id: 'dup', kind: 'mail', name: '', transport: 'REST API', usage: '', adapterId: '', enabledByDefault: true },
      { id: 'dup', kind: 'bogus' as ChannelKind, name: 'n', transport: '무선' as ChannelBinding['transport'], usage: '', adapterId: 'a', enabledByDefault: true },
    ],
  )
  const caught = bad.filter((c) => !c.ok).length
  const structureOk = caught >= 4 // 브랜딩 누락 · id 중복 · 채널1 다중결함 · 채널2 kind/transport

  // 2) 바인딩 검사 — 등록되지 않은 adapterId 는 반드시 해석 실패해야 한다(런타임 무동작 사전 차단)
  const bindingOk = !resolveAdapter('hr', '__no_such_adapter__') && !resolveAdapter('asset', '__no_such_adapter__')

  // 3) 계약 검사 — 반환 형태를 어긴 어댑터는 반드시 부적합으로 잡혀야 한다(dept 누락 Person)
  const brokenHr = { fetchPeople: async () => [{ name: '이름만' }] }
  const contractOk = !(await exerciseContract('hr', brokenHr)).ok

  const ok = structureOk && bindingOk && contractOk
  const detail = ok
    ? `구조 위반 ${caught}건 · 미등록 바인딩 · 형태위반 어댑터 모두 검출`
    : !structureOk ? `구조 검출 부족(${caught}) — 검증기 약화 의심`
      : !bindingOk ? '미등록 adapterId 가 해석됨 — 바인딩 검사 약화'
        : '형태 위반 어댑터를 통과시킴 — 계약 검사 약화'
  return { ok, detail }
}

/** 전 프로필 × 전 채널 자가진단 — 실패가 하나라도 있으면 프레임워크 배포를 막아야 한다 */
export async function runAdapterConformance(): Promise<ConformanceCheck[]> {
  const checks: ConformanceCheck[] = []
  for (const { name, brand, channels } of PROFILES) {
    // 프로필 구조 먼저 — 구조가 깨지면 바인딩·계약도 신뢰할 수 없다
    checks.push(...validateProfileStructure(name, brand, channels))
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
