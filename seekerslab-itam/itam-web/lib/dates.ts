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
import type { Asset, IntakeLot } from '@/lib/types'

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

/** 자연어 기간 표현 → 날짜 창 `{start,end}` (YYYY-MM-DD, 경계 포함).
 *  AI 어시스턴트가 "내년 1분기", "올해 하반기", "2027년 3월", "다음 분기"처럼 시점을 좁히는
 *  질의를 실제 기간으로 해석하도록 한다 (제품안내서 §05 예시 질의 "내년 1분기 보증 만료…").
 *  기간 토큰이 없으면 null → 호출부는 기존(임박순) 동작으로 폴백한다. base 는 today() 문자열. 서버 전용. */
export function parsePeriodWindow(q: string, base: string): { start: string; end: string; label: string } | null {
  const y0 = Number(base.slice(0, 4))
  const m0 = Number(base.slice(5, 7)) // 1-based
  if (!y0 || !m0) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  // 월말일 — Date.UTC(y, m, 0) 은 1-based m 의 전월 마지막 = m 월 말일. 로컬 Date 의 TZ 흔들림을 피해 UTC 로 계산.
  const win = (y: number, sm: number, em: number, label: string) => ({
    start: `${y}-${pad(sm)}-01`,
    end: `${y}-${pad(em)}-${pad(new Date(Date.UTC(y, em, 0)).getUTCDate())}`,
    label,
  })

  // 대상 연도 — 명시 "YYYY년" 우선, 아니면 상대어(내년/작년/올해)
  const yExplicit = q.match(/(20\d{2})\s*년/)
  let year = y0
  if (yExplicit) year = Number(yExplicit[1])
  else if (q.includes('내년') || q.includes('명년')) year = y0 + 1
  else if (q.includes('작년') || q.includes('지난해') || q.includes('전년')) year = y0 - 1

  const curQ = Math.floor((m0 - 1) / 3) + 1

  // 분기 — "N분기"(연도어와 조합) · 상대(이번/다음)
  const qm = q.match(/([1-4])\s*분기/)
  if (qm) { const qn = Number(qm[1]); const sm = (qn - 1) * 3 + 1; return win(year, sm, sm + 2, `${year}년 ${qn}분기`) }
  if (q.includes('이번 분기') || q.includes('금분기') || q.includes('당분기')) { const sm = (curQ - 1) * 3 + 1; return win(y0, sm, sm + 2, `${y0}년 ${curQ}분기`) }
  if (q.includes('다음 분기') || q.includes('차분기')) { const nq = curQ === 4 ? 1 : curQ + 1; const ny = curQ === 4 ? y0 + 1 : y0; const sm = (nq - 1) * 3 + 1; return win(ny, sm, sm + 2, `${ny}년 ${nq}분기`) }

  // 반기
  if (q.includes('상반기')) return win(year, 1, 6, `${year}년 상반기`)
  if (q.includes('하반기')) return win(year, 7, 12, `${year}년 하반기`)

  // 월 — 명시 "N월"(단 '개월'·'월간' 제외) · 상대(이번/다음 달)
  const mm = q.match(/(1[0-2]|[1-9])\s*월/)
  if (mm && !q.includes('개월') && !q.includes('월간')) { const mn = Number(mm[1]); return win(year, mn, mn, `${year}년 ${mn}월`) }
  if (q.includes('이번 달') || q.includes('이달') || q.includes('당월') || q.includes('금월')) return win(y0, m0, m0, `${y0}년 ${m0}월`)
  if (q.includes('다음 달') || q.includes('내달') || q.includes('익월')) { const nm = m0 === 12 ? 1 : m0 + 1; const ny = m0 === 12 ? y0 + 1 : y0; return win(ny, nm, nm, `${ny}년 ${nm}월`) }

  // 연도만 명시 (예: "2027년 만료", "내년 만료 계약")
  if (yExplicit || q.includes('내년') || q.includes('작년') || q.includes('명년') || q.includes('지난해')) return win(year, 1, 12, `${year}년`)

  return null
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null
  const d = new Date(dateStr).getTime()
  const t = new Date(today()).getTime()
  if (Number.isNaN(d)) return null
  return Math.round((d - t) / 86_400_000)
}

/** 미답변 QnA SLA(일) — 등록 후 이 기간을 넘겨도 답변이 없으면 응답 지연으로 본다(헬프데스크 SLA). */
export const QNA_SLA_DAYS = 3

/** QnA 등록 후 경과일 — today 기준(음수면 미래 등록, 방어). 지연 판정·경과일 표기에 쓴다. */
export function qnaAgeDays(createdAt: string): number {
  return Math.max(0, -(daysUntil(createdAt) ?? 0))
}

/** 미답변 QnA SLA 경과 — QnA 이면서 답변이 없고 등록 후 SLA(기본 3일)를 넘긴 문의(응답성 지연 신호).
 *  결재 SLA 지연(isApprovalOverdue)과 같은 원칙의 QnA 판. QnA 화면·대시보드가 공유한다. 서버 전용. */
export function isQnaOverdue(p: { kind: string; answer?: unknown; createdAt: string }, slaDays: number = QNA_SLA_DAYS): boolean {
  if (p.kind !== 'QnA' || p.answer) return false
  return qnaAgeDays(p.createdAt) > slaDays
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
 *  staleDays(운영 정책 staleVerifyDays)를 넘은 자산이면 참. 대장 필터·재물조사 편성이 같은 기준을 쓰도록 한 곳에 둔다.
 *  임계값은 스토어 opsPolicy 를 단일 출처로 받는다(호출부가 s.opsPolicy.staleVerifyDays 전달). 서버 전용. */
export function isStaleVerify(a: Asset, staleDays: number): boolean {
  if (a.status === '폐기완료' || a.status === '폐기예정') return false
  if (!a.lastVerifiedAt) return true
  return -(daysUntil(a.lastVerifiedAt) ?? 0) > staleDays
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

/** 도입 예정(발주) 입고 지연 — 도착 예정일이 지났는데 아직 입고되지 않은 사전 등록 로트.
 *  제품안내서 §06 ITSM·구매 연동(SR·발주 연계) — 발주처 독촉·납기 관리의 기준. 서버 전용. */
export function isIntakeOverdue(l: IntakeLot): boolean {
  if (l.status !== '도입 예정' || !l.expectedDate) return false
  return (daysUntil(l.expectedDate) ?? 0) < 0
}

/** 정기 점검 대상 — 예방 정비 예정일이 30일 내로 도래했거나 지난(미시행) 운영 자산. 폐기 절차 자산은 제외. 서버 전용.
 *  반응형 수리(장애·반납)와 별개로, 사전 정비 일정이 도래한 자산을 대장·대시보드에 드러낸다(§03 유지보수). */
export function isMaintenanceDue(a: Asset): boolean {
  // 운영 상태 자산만 대상 — 폐기/분실은 물론, 이미 수리중이거나 반납대기(보유자 이탈 중)인 자산은 예방 정비 대상이 아니다
  // (isLoanOverdue/isRepairOverdue 처럼 상태로 가른다 — 잔여 maintenanceDue 로 인한 큐 오염·오독촉 방지).
  if (!a.maintenanceDue || ['폐기완료', '폐기예정', '분실', '수리중', '반납대기'].includes(a.status)) return false
  return (daysUntil(a.maintenanceDue) ?? 999) <= 30
}

/** 정기 점검 경과(미시행) — 예방 정비 예정일이 지났는데도 점검이 안 된 운영 자산. isMaintenanceДue 의 부분집합(도래 임박 제외).
 *  독촉 대상 판정에 쓴다 — 임박(D-30)은 예고, 경과는 이미 넘긴 것이라 소유 부서 앞으로 점검 독촉을 보낸다. 서버 전용. */
export function isMaintenanceOverdue(a: Asset): boolean {
  // isMaintenanceDue 와 동일 운영 상태 게이트 — 분실·수리중·반납대기 자산에 정기 점검 독촉이 나가지 않게 한다.
  if (!a.maintenanceDue || ['폐기완료', '폐기예정', '분실', '수리중', '반납대기'].includes(a.status)) return false
  return (daysUntil(a.maintenanceDue) ?? 999) < 0
}

/** 보증 상태 — 자산의 보증 만료일 대비 현재 상태. 상세·카드에서 한눈에 보증 여부를 드러낸다(수리 무상 판단·교체 시점).
 *  none=보증 정보 없음(SW 등) / expired=만료 / soon=90일 내 만료 임박 / covered=보증 내. today 인자로 하이드레이션 안전. */
export function warrantyState(warrantyEnd: string, today: string): 'none' | 'expired' | 'soon' | 'covered' {
  if (!warrantyEnd || warrantyEnd === '-') return 'none'
  if (warrantyEnd < today) return 'expired'
  const d = Math.round((Date.parse(warrantyEnd) - Date.parse(today)) / 86_400_000)
  return d <= 90 ? 'soon' : 'covered'
}

/** 상신 후 경과일 — 서버가 준 today(YYYY-MM-DD) 인자로만 계산해 서버·클라이언트 모두 하이드레이션 안전하게 쓴다. */
export function approvalAgeDays(requestedAt: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(requestedAt)) / 86_400_000))
}

/** 결재 지연 — '대기' 상태로 SLA(slaDays, 운영 정책 approvalSlaDays)를 초과했다. Approval 타입 의존을 피해 구조적 타입으로 받는다.
 *  임계값은 스토어 opsPolicy 를 단일 출처로 받는다(호출부가 s.opsPolicy.approvalSlaDays 전달). */
export function isApprovalOverdue(a: { status: string; requestedAt: string }, today: string, slaDays: number): boolean {
  return a.status === '대기' && approvalAgeDays(a.requestedAt, today) > slaDays
}
