import { isReceiptPending } from '@/lib/types'
import { isIntakeOverdue, isLoanDueSoon, isLoanOverdue, isMaintenanceOverdue, isQnaOverdue, isRepairEtaMissing, isRepairOverdue, today } from './dates'
import { impactSources } from './cmdb'
import { missingContractDocs } from './contract'
import { noticeTargets } from './notice'
import { isEolTarget } from './eol'
import { buildMaintenance } from './maintenance'
import { buildProcurement } from './procurement'
import { replacementCandidates } from './reports'
import { buildSaasReview } from './saas-review'
import { getStore } from './store'
import type { Asset, BoardPost, IntakeLot, UserAccount } from './types'

/** 독촉·통보 **신규** 발송 대상 — 대상 조건에 들면서 오늘 아직 보내지 않은 자산만 추린다.
 *  (같은 대상에 하루 두 번 보내지 않는다 — 알림 피로가 알림을 무력화한다. 만료 임박 통지의 lib/expiry 와 같은 규약.)
 *
 *  대장 화면의 '수령 확인 독촉 발송 (N)' · '정기 점검 독촉 발송 (N)' · 'EOL 업그레이드 통보 (N)' 버튼 건수와
 *  각 액션의 발송 로직이 이 모듈을 공유한다. 그전에는 화면이 조건에 드는 자산 전부를 세고 액션만 당일 발송분을
 *  제외해, 한 번 보낸 뒤에도 버튼이 같은 건수로 남아 있다가 누르면 '오늘 발송분 제외 — 대상이 없습니다'로
 *  끝나는 유령 컨트롤이 됐다(만료 임박 알림에서 닫은 바로 그 드리프트). 서버 전용. */
function sentTodayRefs(kind: string, subjectIncludes?: string): Set<string | undefined> {
  const s = getStore()
  const t = today()
  return new Set(
    s.dispatches
      .filter((m) => m.kind === kind && m.at.startsWith(t) && (!subjectIncludes || m.subject.includes(subjectIncludes)))
      .map((m) => m.ref),
  )
}

/** 수령(인수) 미확인 독촉 대상 — 불출 후 인수 확인이 안 된 사용중 자산(현 보유자 보유분만). */
export function receiptRemindTargets(): Asset[] {
  const sent = sentTodayRefs('수령 확인', '독촉')
  return getStore().assets.filter((a) => isReceiptPending(a) && !sent.has(a.assetNo))
}

/** 정기 점검 독촉 대상 — 예방 정비 예정일이 지났는데도 미시행인 운영 자산(임박분 제외). */
export function maintenanceRemindTargets(): Asset[] {
  const sent = sentTodayRefs('정기 점검 독촉')
  return getStore().assets.filter((a) => isMaintenanceOverdue(a) && !sent.has(a.assetNo))
}

/** EOL OS 업그레이드·교체 통보 대상 — 지원 종료가 경과한 운영 중 자산. */
export function eolNoticeTargets(): Asset[] {
  const sent = sentTodayRefs('EOL 업그레이드 통보')
  const t = today()
  return getStore().assets.filter((a) => isEolTarget(a.status, a.os, t) && !sent.has(a.assetNo))
}

/** 대여 반환 독촉 대상 — 연체·반환 임박 대여 자산(오늘 발송분 제외). */
export function loanRemindTargets(): Asset[] {
  const sent = sentTodayRefs('대여 독촉')
  return getStore().assets.filter((a) => (isLoanOverdue(a) || isLoanDueSoon(a)) && !sent.has(a.assetNo))
}

/** 수리 업체 독촉 대상 — 예상 반환일 경과 또는 반환 일정 미회신(eta 미기재) 외부 수리 자산(오늘 발송분 제외). */
export function repairRemindTargets(): Asset[] {
  const sent = sentTodayRefs('수리 독촉')
  return getStore().assets.filter((a) => !!a.repair && (isRepairOverdue(a) || isRepairEtaMissing(a)) && !sent.has(a.assetNo))
}

/** 하위 의존 영향 통지 대상 — 저하·이탈(분실·폐기·수리중·반납대기 · NAC 격리) 상태이면서 하위 의존 자산이 있는 상위 자산 중,
 *  아직 오늘 통지하지 않은 담당 부서가 남아 있는 것. 화면 버튼 건수와 액션 결과가 같은 집합을 보도록 여기 한 곳에서 센다
 *  (수령·정기 점검·EOL 통보와 같은 규약 — 보낸 뒤에도 버튼이 같은 건수로 남는 유령 컨트롤 방지). */
export function impactNoticeTargets(): { asset: Asset; depts: string[]; dependents: string[] }[] {
  const s = getStore()
  const t = today()
  return impactSources()
    .map(({ asset }) => {
      const dependents = s.assets.filter((a) => (a.dependsOn ?? []).includes(asset.assetNo))
      const sent = new Set(
        s.dispatches.filter((m) => m.kind === '의존 영향 통지' && m.ref === asset.assetNo && m.at.startsWith(t)).map((m) => m.to),
      )
      const depts = [...new Set(dependents.map((d) => d.dept || '자산관리팀'))].filter((d) => !sent.has(d))
      return { asset, depts, dependents: dependents.map((d) => d.assetNo) }
    })
    .filter((x) => x.depts.length > 0)
}

/** 공지 미확인자 안내 대상 — 필독 공지의 대상 집단 중 아직 읽음 확인을 안 했고, 오늘 안내를 받지 않은 사람.
 *  수신자 단위로 당일 중복을 막는다(같은 공지로 하루에 두 번 받지 않게). 화면 버튼 건수와 액션이 이 집합을 공유한다.
 *  발행 예정(publishAt 미래) 공지는 대상이 없다 — 공개 전 조기 독촉 금지(화면·서버 게이트와 같은 판정). */
export function noticeRemindTargets(postId: string): { name: string; dept: string }[] {
  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post || !post.pinned) return []
  if (post.publishAt && post.publishAt > today()) return []
  const acked = new Set((post.acks ?? []).map((a) => a.by))
  const sent = new Set(
    s.dispatches.filter((m) => m.kind === '공지 독촉' && m.ref === postId && m.at.startsWith(today())).map((m) => m.to),
  )
  return noticeTargets(post, s.users)
    .filter((u) => !acked.has(u.name) && !sent.has(`${u.name} (${u.dept})`))
    .map((u) => ({ name: u.name, dept: u.dept }))
}

/** MFA 등록 요구 대상 — MFA 미적용 계정 중 오늘 아직 요구 통지를 보내지 않은 계정.
 *  화면 버튼 건수와 액션이 이 한 집합을 공유해야 보낸 뒤에도 같은 건수로 남는 유령 컨트롤이 생기지 않는다
 *  (수령 확인·정기 점검·EOL·QnA 독촉과 같은 규약 — 알림 피로가 알림을 무력화한다). */
export function mfaRemindTargets(): UserAccount[] {
  const sent = sentTodayRefs('MFA 등록 요구')
  return getStore().users.filter((u) => !u.mfa && !sent.has(u.login))
}

/** QnA 답변 독촉 대상 — SLA 경과 미답변 문의(오늘 발송분 제외). */
export function qnaRemindTargets(): BoardPost[] {
  const sent = sentTodayRefs('QnA 독촉')
  return getStore().posts.filter((p) => isQnaOverdue(p) && !sent.has(p.id))
}

/** 유지보수 예산 통보 대상 — 예산 초과·소진 임박 계약(오늘 발송분 제외). */
export function maintenanceBudgetTargets() {
  const sent = sentTodayRefs('유지보수 예산 통보')
  return buildMaintenance().rows.filter((r) => (r.status === '예산 초과' || r.status === '소진 임박') && !sent.has(r.id))
}

/** 유지보수 이행 독촉 대상 — 계약액이 있는데 집행이 없는(미집행) 계약(오늘 발송분 제외).
 *  기간이 끝난 계약은 뺀다 — 집행할 기간이 없는데 '집행하라'고 재촉하면 받는 쪽이 할 수 있는 일이 없다
 *  (정산·갱신이 맞는 조치다). 화면은 그 계약을 계속 보여 주고 사유를 밝힌다. */
export function maintenanceExecTargets() {
  const sent = sentTodayRefs('유지보수 이행 독촉')
  return buildMaintenance().rows.filter((r) => r.status === '미집행' && !r.ended && !sent.has(r.id))
}

/** 유지보수 SLA 위반 독촉 대상 — 대응 시한을 넘긴 열린 수리를 가진 계약(오늘 발송분 제외). */
export function maintenanceSlaTargets() {
  const sent = sentTodayRefs('유지보수 SLA 위반 독촉')
  return buildMaintenance().rows.filter((r) => r.slaBreach > 0 && !sent.has(r.id))
}

/** 발주 이행 독촉 대상 — 발주 미이행(발주율 저조·만료 임박) 구매 계약(오늘 발송분 제외). */
export function procurementRemindTargets() {
  const sent = sentTodayRefs('발주 이행 독촉')
  return buildProcurement().atRisk.filter((r) => !sent.has(r.id))
}

/** 교체 검토 통보 대상 — 내용연수·보증 경과·장애 이력으로 교체 시점이 도래한 자산(오늘 발송분 제외). */
export function replacementNoticeTargets() {
  const sent = sentTodayRefs('교체 검토 통보')
  return replacementCandidates().cands.filter(({ a }) => !sent.has(a.assetNo))
}

/** SaaS 판정 기한 경과 에스컬레이션 대상 — 판정 SLA 를 넘긴 검토중 SaaS(오늘 발송분 제외). */
export function saasEscalateTargets() {
  const sent = sentTodayRefs('SaaS 판정 독촉')
  return buildSaasReview().overdue.filter((e) => !sent.has(e.id))
}

/** 계약 부속서류 제출 요청 대상 — 필수 부속서류가 누락된 계약(오늘 발송분 제외). */
export function contractDocsTargets() {
  const sent = sentTodayRefs('부속서류 제출 요청')
  return getStore().contracts.filter((c) => missingContractDocs(c).length > 0 && !sent.has(c.id))
}

/** 입고 지연 독촉 대상 — 도착 예정일이 지난 도입 예정(발주) 로트(오늘 발송분 제외). */
export function intakeRemindTargets(): IntakeLot[] {
  const sent = sentTodayRefs('입고 독촉')
  return getStore().intakeLots.filter((l) => isIntakeOverdue(l) && !sent.has(l.id))
}
