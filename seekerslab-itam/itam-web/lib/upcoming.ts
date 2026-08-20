import { daysUntil } from './dates'
import { nextRunOf } from './reports'
import { getStore } from './store'

export interface UpcomingItem { date: string; dday: number; kind: string; label: string; href: string; tone: 'warn' | 'info' }

/** 다가오는 일정(향후 N일·미경과) — 반응형 큐(경과·미조치·임박 카운트)와 달리, 아직 도래하지 않은 예정 작업을
 *  한 타임라인(날짜순 아젠다)으로 모아 주/월 단위 사전 계획을 돕는다. 정기 점검·계약/라이선스/보증 갱신·재물조사
 *  마감·정례 리포트 배포를 한 곳에서 "무엇을 언제" 순서로 본다(카운트가 아니라 순번). 자산담당·Admin 관점. */
export function upcomingSchedule(days = 14): UpcomingItem[] {
  const s = getStore()
  const items: UpcomingItem[] = []
  const push = (date: string, kind: string, label: string, href: string) => {
    const n = daysUntil(date)
    if (n === null || n < 0 || n > days) return // 미경과·창 이내만 (경과분은 반응형 큐가 담당)
    items.push({ date, dday: n, kind, label, href, tone: n <= 3 ? 'warn' : 'info' })
  }
  for (const a of s.assets) {
    if (['폐기완료', '폐기예정'].includes(a.status)) continue
    if (a.maintenanceDue) push(a.maintenanceDue, '정기 점검', `${a.assetNo} · ${a.model}`, `/assets/register?sel=${a.assetNo}`)
    if (a.warrantyEnd !== '-') push(a.warrantyEnd, '보증 만료', `${a.assetNo} · ${a.model}`, `/assets/register?sel=${a.assetNo}`)
  }
  for (const c of s.contracts) if (c.status !== '해지' && c.end !== '-') push(c.end, '계약 만료', `${c.id} · ${c.name}`, `/inventory/contracts?sel=${c.id}`)
  for (const l of s.licenses) if (l.status !== '해지' && l.expiry !== '-') push(l.expiry, '라이선스 만료', `${l.id} · ${l.name}`, `/inventory/contracts?sel=${l.id}`)
  for (const r of s.inventoryRounds) if (r.status !== '완료') push(r.dueDate, '재물조사 마감', r.name, '/inventory/survey-plan')
  for (const sc of s.reportSchedules) if (sc.enabled) { const nr = nextRunOf(sc); if (nr) push(nr, '리포트 배포', sc.kind, '/ai/reports') }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
}
