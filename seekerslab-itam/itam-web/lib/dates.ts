/** 플랫폼 기준일·시각 — 만료 계산과 신규 기록(스캔·리포트·감사 로그)의 '지금'.
 *
 *  두 가지를 반드시 지켜야 한다.
 *
 *  1. **호출 시점에 계산한다(함수, 상수 아님).** 모듈 로드 시 상수로 굳히면 컨테이너가 며칠간
 *     떠 있는 동안 기동일이 영구히 '오늘'로 남는다.
 *  2. **표준시를 명시한다(Asia/Seoul).** 컨테이너는 보통 UTC 로 동작하므로 KST 자정~09시
 *     사이에는 날짜가 하루 뒤처진다 — 실제로 D-22 로 표시돼야 할 계약이 D-23 으로 보였다.
 *
 *  시연에서 특정 날짜를 재현하려면 `ITAM_TODAY=YYYY-MM-DD`, 표준시를 바꾸려면 `ITAM_TZ`.
 *  서버 전용 모듈 — 클라이언트에서 쓰면 하이드레이션 불일치가 생긴다.
 */
import { STALE_VERIFY_DAYS, type Asset } from '@/lib/types'

const TZ = process.env.ITAM_TZ || 'Asia/Seoul'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

/** 기준일 `YYYY-MM-DD` (기본 KST) */
export function today(): string {
  const pinned = process.env.ITAM_TODAY
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned
  return dateFmt.format(new Date())
}

/** 감사 로그·이력용 타임스탬프 `YYYY-MM-DD HH:MM:SS` (기준일 + 현재 시각) */
export function nowStamp(): string {
  return `${today()} ${timeFmt.format(new Date())}`
}

/** 목록 표시용 `YYYY-MM-DD HH:MM` (초 생략).
 *  `new Date().getHours()` 로 조립하면 프로세스 표준시(컨테이너=UTC)를 따라가 날짜는 KST,
 *  시각은 UTC 인 뒤섞인 값이 된다 — 반드시 이 함수를 쓴다. */
export function nowMinute(): string {
  return `${today()} ${timeFmt.format(new Date()).slice(0, 5)}`
}

/** 시드 데이터가 작성된 기준일 — 시드와 실제 날짜의 간격을 안내할 때 쓴다 */
export const SEED_BASE_DATE = '2026-07-29'

export function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null
  const d = new Date(dateStr).getTime()
  const t = new Date(today()).getTime()
  if (Number.isNaN(d)) return null
  return Math.round((d - t) / 86_400_000)
}

/** 재물조사 진행률(%) — 계획 대비 스캔. 계획이 0이면 0을 반환(방어). 리포트·대시보드·계획·수행·어시스턴트 공용.
 *  회차 생성 3경로 모두 planned≥1 을 보장하지만, 나눗셈 지점마다 가드를 반복하지 않도록 단일 헬퍼로 통일(방어적). */
export function roundProgressPct(r: { scanned: number; planned: number }): number {
  return r.planned ? Math.round((r.scanned / r.planned) * 100) : 0
}

export function fmtAmount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}

/** 장기 미실측(유령 자산 후보) 판정 — 폐기 경로 자산은 제외하고, 최근 실측이 없거나
 *  STALE_VERIFY_DAYS 를 넘은 자산이면 참. 대장 필터·재물조사 편성이 같은 기준을 쓰도록 한 곳에 둔다.
 *  서버 전용(daysUntil→today 의존). 클라이언트는 서버가 계산한 목록을 받아 쓴다. */
export function isStaleVerify(a: Asset): boolean {
  if (a.status === '폐기완료' || a.status === '폐기예정') return false
  if (!a.lastVerifiedAt) return true
  return -(daysUntil(a.lastVerifiedAt) ?? 0) > STALE_VERIFY_DAYS
}

/** 대여 연체 — '대여중' 상태이고 반환 기한이 지난 자산. 대장 필터·대시보드 큐가 같은 기준을 쓴다. 서버 전용. */
export function isLoanOverdue(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  return (daysUntil(a.loanDueDate) ?? 0) < 0
}

/** 대여 반환 임박 — '대여중'이고 반환 기한이 오늘~7일 이내(아직 연체는 아님). 연체 전 사전 독촉 대상. 서버 전용. */
export function isLoanDueSoon(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  const d = daysUntil(a.loanDueDate)
  return d !== null && d >= 0 && d <= 7
}

/** 수리 예상 반환 경과 — '수리중'이고 수리 의뢰의 예상 반환일이 지났는데 아직 완료되지 않았다(업체 지연). 담당자가 업체를 독촉할 대상. 서버 전용. */
export function isRepairOverdue(a: Asset): boolean {
  if (a.status !== '수리중' || !a.repair?.eta) return false
  return (daysUntil(a.repair.eta) ?? 0) < 0
}

/** 보증 상태 — 자산의 보증 만료일 대비 현재 상태. 상세·카드에서 한눈에 보증 여부를 드러낸다(수리 무상 판단·교체 시점).
 *  none=보증 정보 없음(SW 등) / expired=만료 / soon=90일 내 만료 임박 / covered=보증 내. today 인자로 하이드레이션 안전. */
export function warrantyState(warrantyEnd: string, today: string): 'none' | 'expired' | 'soon' | 'covered' {
  if (!warrantyEnd || warrantyEnd === '-') return 'none'
  if (warrantyEnd < today) return 'expired'
  const d = Math.round((Date.parse(warrantyEnd) - Date.parse(today)) / 86_400_000)
  return d <= 90 ? 'soon' : 'covered'
}

/** 결재 대기 SLA — 상신 후 이 일수를 넘겨 대기 중이면 '지연'(결재 정체). */
export const APPROVAL_SLA_DAYS = 3

/** 상신 후 경과일 — 서버가 준 today(YYYY-MM-DD) 인자로만 계산해 서버·클라이언트 모두 하이드레이션 안전하게 쓴다. */
export function approvalAgeDays(requestedAt: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(requestedAt)) / 86_400_000))
}

/** 결재 지연 — '대기' 상태로 SLA(3일)를 초과했다. Approval 타입 의존을 피해 구조적 타입으로 받는다. */
export function isApprovalOverdue(a: { status: string; requestedAt: string }, today: string): boolean {
  return a.status === '대기' && approvalAgeDays(a.requestedAt, today) > APPROVAL_SLA_DAYS
}
