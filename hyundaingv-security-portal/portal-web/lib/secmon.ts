/** 보안관제(secmon) 어댑터 → 보안위반 자동 등록. 탐지 이벤트(DLP·EDR)를 조회해 유효 위반 유형만
 *  징구중으로 편입한다. 일배치(notify)·수동 트리거 공용. 계약 위반(오형·미정의 유형)·중복 이관 행은
 *  건너뛴다(secdata importDaily·syncHr 와 동일 수집 방어). 위반 자동 등록 후 확인서 흐름은 기존 경로
 *  (징구중 → 확인서 제출/결재제외, 일배치 '확인서 미제출' 안내)가 이어받는다 — 편입 시 개별 메일은 보내지
 *  않아 배치 편입 시 메일 폭주를 피한다. */
import { audit } from './audit'
import { today } from './dates'
import { secmonAdapter, withTimeout } from './integrations/registry'
import { activeCodes, getStore, nextNo } from './store'
import type { ViolationType } from './types'

export interface SecmonImportResult {
  added: number
  ok: boolean
  detail: string
}

export async function importSecurityEvents(actor: string): Promise<SecmonImportResult> {
  const adapter = secmonAdapter()
  if (!adapter) return { added: 0, ok: false, detail: '보안관제 채널 중지/미등록' }
  const s = getStore()
  try {
    const events = await withTimeout(adapter.fetchEvents(), '보안관제 이벤트 조회')
    // 계약 위반(비배열) 방어 — 검증 없이 순회하면 for..of 가 500 (syncHr·secdata 수집 검증과 동일)
    if (!Array.isArray(events)) return { added: 0, ok: false, detail: '계약 위반: 이벤트가 배열 아님' }
    let added = 0
    for (const ev of events) {
      const e = ev as { name?: unknown; dept?: unknown; type?: unknown; detail?: unknown; detectedAt?: unknown }
      // 수집 방어 — 필수 문자열 5필드. 오형 행은 건너뛴다(undefined name 은 위반 목록·수신자를 유령으로 만든다).
      if (typeof e.name !== 'string' || typeof e.dept !== 'string' || typeof e.type !== 'string'
        || typeof e.detail !== 'string' || typeof e.detectedAt !== 'string') continue
      // 유효 위반 유형만 편입 — 코드에 없는 탐지 유형(어댑터 오매핑)은 건너뛴다(shape 는 conformance, code 는 여기).
      if (!activeCodes(s, 'VIOLATION_TYPE').includes(e.type)) continue
      // 중복 이관 방지 — 같은 (위반자·유형·발생일) 위반이 이미 있으면 건너뛴다(반복 조회로 중복 등록 방지, by-value).
      if (s.violations.some((v) => v.name === e.name && v.type === e.type && v.occurredAt === e.detectedAt)) continue
      // 검증한 필드만 명시 구성 — 원시 이벤트 스프레드 금지(id·status 포털 통제, secdata importDaily 와 동일)
      const id = nextNo('VL', today().slice(0, 4), s.violations.map((v) => v.id))
      s.violations.unshift({ id, name: e.name, dept: e.dept, type: e.type as ViolationType, detail: e.detail.slice(0, 300), occurredAt: e.detectedAt, status: '징구중' })
      // 이력추적성(§VI) — 자동 등록도 등록 주체(스케줄러/실행자)를 감사에 남긴다(수동 addViolation 과 동일 정책).
      audit(actor, '보안위반 등록', `${id} ${e.name}(${e.dept}) — ${e.type} [보안관제 자동]`)
      added += 1
    }
    return { added, ok: true, detail: `보안관제 탐지 ${events.length}건 중 ${added}건 위반 편입` }
  } catch (err) {
    return { added: 0, ok: false, detail: `연동 예외: ${err instanceof Error ? err.message : String(err)}` }
  }
}
