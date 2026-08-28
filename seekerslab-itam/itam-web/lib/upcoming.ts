import { daysUntil } from './dates'
import { nextRunOf } from './reports'
import { getStore } from './store'
import { GONE_STATUSES, NON_OPERATIONAL_STATUSES } from './types'

export interface UpcomingItem { date: string; dday: number; kind: string; label: string; href: string; tone: 'warn' | 'info' }

/** 다가오는 일정(향후 N일·미경과) — 반응형 큐(경과·미조치·임박 카운트)와 달리, 아직 도래하지 않은 예정 작업을
 *  한 타임라인(날짜순 아젠다)으로 모아 주/월 단위 사전 계획을 돕는다. 정기 점검·계약/라이선스/보증 갱신·재물조사
 *  마감·정례 리포트 배포를 한 곳에서 "무엇을 언제" 순서로 본다(카운트가 아니라 순번). 자산담당·Admin 관점. */
/** 아젠다 창(일) — 대시보드 카드 제목·빈 상태 문구가 이 수를 그대로 말한다.
 *  세 곳(호출·제목·빈 문구)에 14 를 각자 적어 두면 창을 바꿀 때 문구만 옛 수로 남아 화면이 거짓을 말한다
 *  (정기 점검 창 문구가 실제로 그렇게 굳어 있었다 — #695). 한 곳에서 읽는다. */
export const UPCOMING_WINDOW_DAYS = 14

export function upcomingSchedule(days = UPCOMING_WINDOW_DAYS): UpcomingItem[] {
  const s = getStore()
  const items: UpcomingItem[] = []
  const push = (date: string, kind: string, label: string, href: string) => {
    const n = daysUntil(date)
    if (n === null || n < 0 || n > days) return // 미경과·창 이내만 (경과분은 반응형 큐가 담당)
    items.push({ date, dday: n, kind, label, href, tone: n <= 3 ? 'warn' : 'info' })
  }
  for (const a of s.assets) {
    // 손을 떠난 자산(분실·폐기예정·폐기완료)은 예정 일정에서 뺀다 — 없어진 장비의 보증 만료를 주간 계획에 올려 봐야
    //  연장·교체 검토를 할 대상이 아니다. 그전에는 폐기 두 상태만 빼서 분실 자산의 보증 만료가 아젠다에 남았다
    //  (같은 개념 두 정의 — 계약 커버리지·재배치 풀은 이미 GONE_STATUSES 한 기준을 쓴다).
    if (GONE_STATUSES.includes(a.status)) continue
    // 정기 점검만 운영 상태 게이트를 더 좁게 본다 — 점검 도래 큐(isMaintenanceDue)·독촉(isMaintenanceOverdue)이
    //  분실·수리중·반납대기를 빼는데 아젠다만 폐기 두 상태로 걸러, 아무도 쫓지 않을 점검이 주간 계획에 실렸다(같은 개념 두 정의).
    if (a.maintenanceDue && !NON_OPERATIONAL_STATUSES.includes(a.status)) push(a.maintenanceDue, '정기 점검', `${a.assetNo} · ${a.model}`, `/assets/register?sel=${a.assetNo}`)
    if (a.warrantyEnd !== '-') push(a.warrantyEnd, '보증 만료', `${a.assetNo} · ${a.model}`, `/assets/register?sel=${a.assetNo}`)
    // 대여 반환 기한 — 연체(isLoanOverdue)·반환 임박(isLoanDueSoon)은 반응형 큐가 이미 다루는데 아젠다에는 빠져 있었다.
    //  '경과분은 반응형 큐, 예정분은 아젠다'라는 이 함수의 분담 규칙대로면 아직 도래하지 않은 반환 기한도 여기 있어야 한다
    //  (담당자가 주간 계획을 세울 때 '목요일에 3대 돌아온다'가 보이지 않았다).
    if (a.status === '대여중' && a.loanDueDate) push(a.loanDueDate, '대여 반환', `${a.assetNo} · ${a.model} (${a.owner})`, `/assets/returns`)
  }
  // 도입 예정 입고 — 납기 경과(isIntakeOverdue)는 반응형 큐에 있는데 도착 예정일은 아젠다에 없었다(대여 반환과 같은 누락).
  for (const l of s.intakeLots) if (l.status === '도입 예정' && l.expectedDate) push(l.expectedDate, '입고 예정', `${l.id} · ${l.model} ${l.qty}대`, '/assets/intake')
  for (const c of s.contracts) if (c.status !== '해지' && c.end !== '-') push(c.end, '계약 만료', `${c.id} · ${c.name}`, `/inventory/contracts?sel=${c.id}`)
  for (const l of s.licenses) if (l.status !== '해지' && l.expiry !== '-') push(l.expiry, '라이선스 만료', `${l.id} · ${l.name}`, `/inventory/contracts?sel=${l.id}`)
  for (const r of s.inventoryRounds) if (r.status !== '완료') push(r.dueDate, '재물조사 마감', r.name, '/inventory/survey-plan')
  for (const sc of s.reportSchedules) if (sc.enabled) { const nr = nextRunOf(sc); if (nr) push(nr, '리포트 배포', sc.kind, '/ai/reports') }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
}
