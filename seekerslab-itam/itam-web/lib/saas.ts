import { today } from './dates'
import { escalate } from './notify'
import { getStore } from './store'
import type { SaasCatalogEntry, SaasUsage } from './types'

/** SaaS 카탈로그 판정(상태 반영) — 설정 카탈로그(decideSaas)·Shadow SaaS(classifyShadowSaas) 두 진입점이
 *  동일한 판정 결과를 내도록 단일화한다. 그동안 차단 집행 요청은 설정 화면에서만 나가고 Shadow SaaS 화면에서
 *  차단하면 카탈로그 상태만 바뀌어, 문서가 광고한 '두 화면 동일 카탈로그' 대칭이 깨져 있었다.
 *  판정자·기한(검토중 SLA) 반영 + 부서별 사용 현황 인가 동기화 + 차단 신규 판정 시 보안운영팀 프록시·DNS
 *  차단 집행 요청(로37 검출→조치, 외부 노출 차단과 대칭). 감사 문구는 호출부가 newlyBlocked 로 보강한다. */
/** 차단 판정이 난 SaaS 서비스명 집합 — 카탈로그가 곧 판정 대장이다.
 *  브리핑·엑셀 반출·Shadow SaaS 화면·어시스턴트가 각자 같은 Set 을 만들고 있었다. */
export function blockedSaasServices(): Set<string> {
  return new Set(getStore().saasCatalog.filter((c) => c.status === '차단').map((c) => c.service))
}

/** 판정 대기 미인가 SaaS — 미인가지만 차단 판정까지는 나지 않은 것.
 *  sanctioned 는 인가/미인가 두 값뿐이라 '차단'을 담지 못한다 — 차단 판정이 끝난 서비스는 판정 갭이 아니다.
 *  화면 KPI·부서별 요약·주간 브리핑·엑셀 반출이 이 한 정의를 공유해야 같은 수를 말한다. */
export function shadowSaasPending(): SaasUsage[] {
  const blocked = blockedSaasServices()
  return getStore().saas.filter((x) => !x.sanctioned && !blocked.has(x.service))
}

export function decideSaasStatus(entry: SaasCatalogEntry, status: SaasCatalogEntry['status'], actor: string): { newlyBlocked: boolean; newlyUnblocked: boolean } {
  const s = getStore()
  const prev = entry.status
  entry.status = status
  entry.decidedAt = today()
  entry.decidedBy = actor
  entry.reviewSince = status === '검토중' ? today() : undefined // 판정 완료 시 기한 추적 종료

  // 폐쇄 루프 — 카탈로그 판정을 Shadow SaaS 부서별 사용 현황의 인가 여부에 즉시 반영
  const usage = s.saas.find((u) => u.service === entry.service)
  if (usage) usage.sanctioned = status === '인가'

  // 차단 신규 판정은 정책 표시로 끝나지 않고 보안운영팀에 프록시·DNS 차단 집행을 요청한다(검출→조치).
  const newlyBlocked = status === '차단' && prev !== '차단'
  if (newlyBlocked) {
    escalate({ to: '보안운영팀', subject: `${entry.service} 차단 판정 — 프록시·DNS 차단 집행 요청 (데이터 등급 ${entry.dataGrade})`, kind: '격리 통보', ref: entry.id, sms: `${entry.service} 차단 집행 — 프록시·DNS (등급 ${entry.dataGrade})` })
  }
  // 차단 해제(차단 → 인가·검토중)는 집행 해제까지 요청해야 한다 — 카탈로그만 되돌리면 프록시·DNS 차단은 그대로 남아
  //  화면은 '검토중·인가'인데 실제로는 계속 막혀 있는 상태가 된다(NAC 격리 해제와 같은 짝 맞추기).
  const newlyUnblocked = prev === '차단' && status !== '차단'
  if (newlyUnblocked) {
    escalate({ to: '보안운영팀', subject: `${entry.service} 차단 해제 (${status} 판정) — 프록시·DNS 차단 해제 집행 요청`, kind: '격리 통보', ref: entry.id, sms: `${entry.service} 차단 해제 — 프록시·DNS 해제 (${status})` })
  }
  return { newlyBlocked, newlyUnblocked }
}
