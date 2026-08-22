import { daysUntil, today } from './dates'
import { getStore } from './store'
import type { Contract, SwLicense } from './types'

export type ExpiryNoticeTargets = {
  /** 통지 대상 계약 (해지 제외 · 창 안 · 오늘 미발송) */
  contracts: Contract[]
  /** 통지 대상 라이선스 (해지·영구 제외 · 창 안 · 오늘 미발송) */
  licenses: SwLicense[]
  /** 보증 만료 임박 자산의 부서별 대수 — 자산마다 보내면 아무도 읽지 않아 부서 단위로 한 통씩 묶는다. 오늘 미발송 부서만 */
  warrantyDepts: Map<string, number>
  /** 실제로 나갈 통지 건수 (계약 + 라이선스 + 보증 부서) */
  count: number
  /** 만료 알림 창(일) — 운영 정책 expiryWindowDays */
  windowDays: number
}

/** 만료 임박 **신규** 통지 대상 — 계약·라이선스·보증(부서 단위 묶음) 중 알림 창 안에 들고
 *  오늘 아직 통지하지 않은 대상만 추린다(같은 대상에 하루 두 번 보내지 않는다 — 알림 피로가 알림을 무력화한다).
 *
 *  계약·라이선스 화면의 '만료 임박 알림 발송 (N)' 버튼 건수와 sendExpiryNotices 발송 로직이 이 한 함수를
 *  공유한다. 그동안 화면은 창 안 대상 전부를 세고 액션만 오늘 발송분을 제외해, 이미 다 보낸 뒤에도
 *  버튼이 활성인 채 전체 건수를 보이다가 누르면 '신규 알림 대상이 없습니다'로 끝나는 드리프트가 있었다.
 *  서버 전용. */
export function expiryNoticeTargets(): ExpiryNoticeTargets {
  const s = getStore()
  const t = today()
  const windowDays = s.opsPolicy.expiryWindowDays
  const within = (end: string) => {
    const d = daysUntil(end)
    return d !== null && d <= windowDays
  }
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '만료 임박' && m.at.startsWith(t)).map((m) => m.ref),
  )

  const contracts = s.contracts.filter((c) => c.status !== '해지' && within(c.end) && !sentToday.has(c.id))
  const licenses = s.licenses.filter((l) => l.status !== '해지' && l.expiry !== '-' && within(l.expiry) && !sentToday.has(l.id))

  const warrantyDepts = new Map<string, number>()
  for (const a of s.assets) {
    if (a.warrantyEnd === '-' || ['폐기완료', '폐기예정'].includes(a.status)) continue
    if (!within(a.warrantyEnd)) continue
    warrantyDepts.set(a.dept, (warrantyDepts.get(a.dept) ?? 0) + 1)
  }
  for (const dept of [...warrantyDepts.keys()]) {
    if (sentToday.has(warrantyNoticeRef(dept))) warrantyDepts.delete(dept)
  }

  return { contracts, licenses, warrantyDepts, count: contracts.length + licenses.length + warrantyDepts.size, windowDays }
}

/** 보증 만료 통지의 중복 억제 키 — 부서 단위 묶음 발송이라 계약·라이선스처럼 ID 가 없다. */
export function warrantyNoticeRef(dept: string): string {
  return `WRT-${dept}`
}
