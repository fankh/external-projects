import { staleComposeTargets } from '@/lib/survey'
import { DEGRADED_CONNECTOR_STATUSES, USER_REQUEST_KINDS } from '@/lib/types'
import Link from 'next/link'
import { Card, Chip, RiskChip, ScreenHeader, Stat } from '@/components/ui'
import { canDecideApproval } from '@/lib/approval'
import { daysUntil, isApprovalOverdue, isIntakeOverdue, isLoanDueSoon, isLoanOverdue, isMaintenanceDue, isWarrantyExpiring, isQnaOverdue, isRepairOverdue, nowMinute, roundProgressPct, today } from '@/lib/dates'
import { isEasmRescanOverdue } from '@/lib/easm'
import { criticalDependencies } from '@/lib/cmdb'
import { upcomingSchedule } from '@/lib/upcoming'
import { overdueScanChannels } from '@/lib/scan-policy'
import { buildLicenseUsage } from '@/lib/license-usage'
import { isEolTarget } from '@/lib/eol'
import { buildVulnPriority } from '@/lib/vuln-priority'
import { inNoticeAudience, noticeTargets } from '@/lib/notice'
import { deptOfOwner, hasDataIssue } from '@/lib/quality'
import { canViewMenu } from '@/lib/perm'
import { approvalHref, entityHref, noticeHref, qnaHref } from '@/lib/reflink'
import { impactNoticeTargets } from '@/lib/reminders'
import { buildMaintenance } from '@/lib/maintenance'
import { buildProcurement } from '@/lib/procurement'
import { buildSaasReview, SAAS_REVIEW_SLA_DAYS } from '@/lib/saas-review'
import { isScheduleOverdue, licenseOptimization, replacementCandidates } from '@/lib/reports'
import { compositeRiskAssetNos } from '@/lib/risk'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { lowStockCategories } from '@/lib/stock'

export const dynamic = 'force-dynamic'

const NOTICE_TOP = 5
const UPCOMING_TOP = 8

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notices?: string; upcoming?: string }> }) {
  // 대시보드 카드는 상위 몇 건만 보여 주고 나머지는 '외 N건'으로만 알렸다 — 그런데 그 N건을 볼 길이 없었다.
  //  다가오는 일정은 여러 화면에서 모아 만든 목록이라 대신 열 화면도 없고, 내게 온 알림은 발송 이력 화면이
  //  운영 권한이라 사용자에겐 아예 닫혀 있다. 카드 안에서 전부 펼칠 수 있게 한다(?notices=all · ?upcoming=all).
  const { notices: noticesParam, upcoming: upcomingParam } = await searchParams
  const showAllNotices = noticesParam === 'all'
  const showAllUpcoming = upcomingParam === 'all'
  const session = (await getSession())!
  const s = getStore()

  const inUse = s.assets.filter((a) => a.status === '사용중').length
  const idle = s.assets.filter((a) => a.status === '유휴' || a.status === '반납대기').length
  const newFound = s.discovered.filter((d) => d.state === '미등록' && !d.action)
  // 라이선스 판정(초과·만료·미사용 회수)은 분석 화면 패널·리포트·어시스턴트와 동일한 licenseOptimization() 단일 소스.
  const licOpt = licenseOptimization()
  const maint = buildMaintenance()
  // 교체 대상(내용연수 초과·보증 경과·장애 이력)은 수명예측 패널·연간 교체 계획 리포트와 동일한 replacementCandidates() 단일 소스.
  const replCands = replacementCandidates().cands
  // 다가오는 일정(향후 14일 아젠다) — 계약·라이선스 링크가 자산담당·Admin 화면이라 그 역할에만 산출(SEC_MGR 은 dead-end 방지).
  // 일정 항목도 처리 화면으로 가는 링크다 — 큐와 같은 규약으로 매트릭스 조회를 회수한 화면 항목은 뺀다.
  const upcoming = (['ASSET_MGR', 'ADMIN'].includes(session.role) ? upcomingSchedule(14) : []).filter((u) => canViewMenu(u.href, session.role))
  const pendingApr = s.approvals.filter((a) => a.status === '대기')
  // 결재 지연 — SLA(3일) 초과한 대기 결재(정체). 상신 후 오래 방치된 결재를 드러낸다.
  const overdueApr = pendingApr.filter((a) => isApprovalOverdue(a, today(), s.opsPolicy.approvalSlaDays)).length
  const myApr = s.approvals.filter((a) => a.requester === session.name && a.status === '대기')
  // 내 결재 차례 — 지금 이 사람이 결재할 수 있는 대기 건 (본인 상신분 제외). decide()와 동일 게이트를 쓴다.
  const myQueue = s.approvals.filter((a) => a.requester !== session.name && canDecideApproval(session.role, a))
  const myAssets = s.assets.filter((a) => a.owner === session.name)
  // 내 미확인 필독 공지 — 상단 고정(필독) 공지 중 내가 아직 읽음 확인하지 않은 것. 사용자가 로그인 시 스스로 챙기게 하는 컴플라이언스 넛지
  // (관리자 측 독촉(로39)·미확인자 명단(v1.150)의 사용자 측 짝). 발행 예정(publishAt 미래) 공지는 아직 안 보이므로 제외.
  const unackedNotices = s.posts.filter(
    (p) => p.kind === '공지' && p.pinned && (!p.publishAt || p.publishAt <= today()) && inNoticeAudience(p, session.dept) && !(p.acks ?? []).some((a) => a.by === session.name),
  )
  // 최근 공지 — Main/Home 의 공지 요약(제품안내서 §01 대시보드·게시판). 발행된 공지를 필독(고정) 우선·최신순으로 노출해
  // 랜딩 시 최신 안내를 게시판까지 가지 않아도 볼 수 있게 한다(예약 발행 전 공지는 제외). 전 권한그룹.
  const recentNotices = [...s.posts]
    // 부서 지정 공지는 대상 부서(+Admin)에게만 — 게시판·전역 검색과 동일 스코핑. 안 걸면 대상 밖 사용자 랜딩에 제목이 유출된다(unackedNotices·검색 라우트와 정합).
    .filter((p) => p.kind === '공지' && (!p.publishAt || p.publishAt <= today()) && (session.role === 'ADMIN' || inNoticeAudience(p, session.dept)))
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.publishAt ?? b.createdAt).localeCompare(a.publishAt ?? a.createdAt))
    .slice(0, 5)
  // 우리 부서 소유자 확인 요청 — 발견 자산이 우리 부서 자산인지 묻는 대기 건. 응답자(해당 부서)가 로그인 시 챙기게 한다
  // (Discovery 소유자 확인 루프(로12)의 응답자 측 — 결재함까지 가지 않아도 대시보드에서 드러난다). 미지정 부서 요청은 전사 공지·격리 경로라 제외.
  const myOwnerConfirms = s.approvals.filter((a) => a.kind === '소유자 확인' && a.status === '대기' && a.dept === session.dept)
  // 반려된 내 신청 — 아직 재상신하지 않은 반려 건. 사용자가 로그인 시 사유를 보고 재상신할지 스스로 판단하게 한다(결재함까지 안 가도 드러남).
  const myRejected = s.approvals.filter(
    (a) => a.requester === session.name && a.status === '반려' && !a.resubmitted && USER_REQUEST_KINDS.includes(a.kind),
  )
  // 수령 확인 대기 — 불출로 배정받았으나 아직 인수 확인을 안 한 본인 자산. 불출 시 안내 메일은 가지만
  // 대시보드에서도 상기시켜 사용자가 직접 수령 확인(체인 오브 커스터디)하게 한다(로54 수령 확인 루프의 사용자 측 능동 접점).
  const myReceipts = s.assets.filter((a) => a.receiptPending && a.status === '사용중' && a.owner === session.name)
  // 내 대여 자산 — 본인이 빌린(대여중·소유자=본인) 자산의 반환 기한. 대여자 관점의 반환 마감 알림.
  // 담당자에게는 대여 현황(반납·유휴)·연체 큐가, 대여자에게는 여기 My Work 가 반환을 상기시킨다(v1.102 독촉 통지의 수신자 측).
  const myLoans = s.assets
    .filter((a) => a.status === '대여중' && a.owner === session.name)
    .map((a) => ({ assetNo: a.assetNo, model: a.model, dueDate: a.loanDueDate ?? '-', dday: a.loanDueDate ? daysUntil(a.loanDueDate) : null }))
    .sort((x, y) => (x.dday ?? 99_999) - (y.dday ?? 99_999))
  // 내게 온 알림 — 나를 수신자(to)로 발송된 통지의 수신자 측 요약. 그동안 발송 이력은 관리자(플랫폼 연동 화면)만 볼 수 있어,
  //  사용자는 이메일 밖에서 자신에게 온 통지(수령 확인·대여/반납 결과·QnA 답변·결재 결과·수리 결과 등)를 앱에서 확인할 곳이 없었다. 최근 5건.
  const myNoticesAll = s.dispatches.filter((m) => m.to === session.name)
  const myNotices = showAllNotices ? myNoticesAll : myNoticesAll.slice(0, NOTICE_TOP)

  // 운영 대기 — 화면마다 흩어진 담당 처리 대기열을 역할에 맞게 한 곳에 모은다
  const opsQueues: { label: string; count: number; href: string; tone: 'err' | 'warn' }[] = []
  if (['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    const issueDue = s.approvals.filter((a) => a.kind === '자산 신청' && a.status === '승인' && !a.fulfilled && !a.refId?.startsWith('DSC-')).length
    const moveDue = s.approvals.filter((a) => a.kind === '이동' && a.status === '승인' && !a.fulfilled).length
    const spof = criticalDependencies() // 영향 집중 자산(단일 장애점) — 이 자산 장애 시 blast radius ≥2
    const compositeRiskNos = compositeRiskAssetNos(s.assets) // 복합 위험(≥2 주의 신호) — 대장 필터·도시어 요약과 lib/risk 단일 소스
    opsQueues.push(
      { label: '입고 검수 대기', count: s.intakeLots.filter((l) => l.status === '입고 대기' || l.status === '검수 중').length, href: '/assets/intake?lot=inspect', tone: 'warn' },
      // 도입 예정 입고 지연 — 도착 예정일이 지났는데 미입고(§06 ITSM·구매 연동). 발주처 독촉·납기 관리 대상.
      { label: '도입 예정 입고 지연 (SR·발주 독촉)', count: s.intakeLots.filter(isIntakeOverdue).length, href: '/assets/intake?lot=overdue', tone: 'err' },
      // 검수 반려 로트 — 불량 반려 후 재검수(교체품 도착)·반품 확인이 필요한 후속 백로그. 방치하면 대금·자산 공백이 생긴다.
      { label: '검수 반려 (재검수 · 반품 확인)', count: s.intakeLots.filter((l) => l.status === '검수 반려').length, href: '/assets/intake?lot=rejected', tone: 'err' },
      { label: '불출 · 이동 집행 대기', count: issueDue + moveDue, href: '/assets/movement', tone: 'warn' },
      { label: '반납 접수 대기', count: s.assets.filter((a) => a.status === '반납대기').length, href: '/assets/returns', tone: 'warn' },
      // 수령 미확인 — 불출 배정 후 사용자 인수 확인이 안 된 자산(체인 오브 커스터디 공백). 방치하면 실물 인계를 감사에서 증명할 수 없다.
      { label: '수령 미확인 (불출 후 인수 대기)', count: s.assets.filter((a) => a.receiptPending && a.status === '사용중').length, href: '/assets/register?receipt=1', tone: 'warn' },
      // 대여 연장 요청 대기 — 대여자(사용자)가 올린 반환 기한 연장 요청. 통보만으론 놓칠 수 있어 대장 상세 밖 대시보드 큐로도 드러낸다(요청대로 연장·반려 처리).
      { label: '대여 연장 요청 대기 (요청대로 연장·반려 처리)', count: s.assets.filter((a) => a.loanExtendRequest).length, href: '/assets/register?loanext=1', tone: 'warn' },
      // 반납 신청 대기 — 대여자가 반납하겠다고 셀프서비스로 알린 건. 회수·점검 후 반환 접수로 마무리한다.
      { label: '반납 신청 대기 (회수·점검 후 반환 접수)', count: s.assets.filter((a) => a.returnRequest).length, href: '/assets/register?loanret=1', tone: 'warn' },
      { label: '수리 진행 · 완료 확인', count: s.assets.filter((a) => a.status === '수리중').length, href: '/assets/returns', tone: 'warn' },
      { label: '수리 예상 반환 경과 (업체 독촉)', count: s.assets.filter(isRepairOverdue).length, href: '/assets/returns?repair=overdue', tone: 'err' },
      // 정기 점검 대상 — 예방 정비 예정일 도래(30일 내·경과) 운영 자산. 반응형 수리와 별개의 사전 정비(§03 유지보수).
      { label: '정기 점검 대상 (예방 정비 도래)', count: s.assets.filter((a) => isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays)).length, href: '/assets/register?maint=1', tone: 'warn' },
      // 영향 집중 자산(단일 장애점·CMDB blast radius) — 이 자산 장애 시 전이적으로 2대 이상 영향. 이중화·우선 정비 대상. 현재 저하(수리중·분실 등) 상태면 즉시 리스크(err).
      { label: `영향 집중 자산 (blast radius ≥2 · 단일 장애점${spof.some((x) => x.degraded) ? ' · 저하 포함' : ''})`, count: spof.length, href: spof.length ? `/assets/register?spof=1` : '/assets/register', tone: spof.some((x) => x.degraded) ? 'err' : 'warn' },
      // 하위 의존 영향 통지 대상 — 상위가 운영에서 빠졌는데 하위 담당 부서에 아직 알리지 않은 건(로75). 대장의 통지 버튼과 같은 집합(lib/reminders).
      { label: '하위 의존 영향 통지 대상 (상위 이탈·격리 · 미통지)', count: impactNoticeTargets().length, href: '/assets/register?impact=1', tone: 'warn' },
      // 복합 위험 자산 — 정합성·EOL·보증·점검·SPOF·교체·미실측 중 2개 이상이 겹치는 다중 이슈 자산. 개별 신호 큐가 놓치는 '한 자산에 문제가 몰린' 우선 조치 대상을 사전에 드러낸다(?risk=1 드릴다운 → 상세 '위험 신호' 요약).
      { label: '복합 위험 자산 (≥2 신호 · 다중 이슈 우선 조치)', count: compositeRiskNos.length, href: compositeRiskNos.length ? '/assets/register?risk=1' : '/assets/register', tone: 'warn' },
      { label: '데이터 소거 대기', count: s.disposals.filter((d) => d.status === '소거 대기').length, href: '/assets/disposal?status=wipe', tone: 'err' },
      { label: '분실 · 도난 자산 (회수·폐기 확정)', count: s.assets.filter((a) => a.status === '분실').length, href: '/assets/register?status=분실', tone: 'err' },
      { label: '대여 반환 연체 (반환 독촉)', count: s.assets.filter(isLoanOverdue).length, href: '/assets/returns?loan=연체', tone: 'err' },
      { label: '대여 반환 임박 (D-7 · 사전 안내)', count: s.assets.filter(isLoanDueSoon).length, href: '/assets/returns?loan=임박', tone: 'warn' },
      // 편성 대기만 센다 — 이미 회차에 묶인 자산까지 세면 편성을 눌러도 큐가 줄지 않는다(lib/survey 단일 소스).
      { label: '장기 미실측 (재물조사 편성 대기)', count: staleComposeTargets().length, href: '/inventory/survey-plan', tone: 'warn' },
      // 재물조사 기한 경과 — 기한이 지난 미완료(계획·진행중) 조사 회차. 회차 표의 '기한 경과' 표시를 담당자 일과 시작점으로 끌어올려 독촉으로 닫는다(로59).
      { label: '재물조사 기한 경과 (담당자 독촉)', count: s.inventoryRounds.filter((r) => r.status !== '완료' && r.dueDate < today()).length, href: '/inventory/survey-plan', tone: 'err' },
      { label: '보증 만료 임박 자산 (연장·교체 검토)', count: s.assets.filter((a) => isWarrantyExpiring(a, s.opsPolicy.expiryWindowDays)).length, href: '/assets/register?warranty=soon', tone: 'warn' },
      // EOL OS 자산 — OS 지원 종료 경과(미패치 취약점 상시 노출). 하드웨어 노후(보증·내용연수)와 별개인 SW 업그레이드·교체 트리거.
      { label: 'EOL OS 자산 (교체·업그레이드 대상)', count: s.assets.filter((a) => isEolTarget(a.status, a.os, today())).length, href: '/assets/register?os=eol', tone: 'err' },
      // 교체 대상 자산 — 내용연수 초과·보증 경과(이미 지난)·장애 이력(잦은 수리). 보증 '임박'(미래 90일)과 달리 이미 교체 시점이 도래한 계획 신호. 수명예측 패널과 같은 근거.
      { label: '교체 대상 자산 (내용연수·보증 경과·장애 이력)', count: replCands.length, href: '/assets/register?replace=1', tone: 'warn' },
      // SW 라이선스 초과 사용(보유<사용)은 SAM 감사 최우선 노출 리스크 — 계약·라이선스 화면에만 있던 것을 담당자 일과 시작점(대시보드)으로 끌어올린다
      { label: '라이선스 초과 사용 (감사 노출)', count: licOpt.over.length, href: '/inventory/contracts?lic=over', tone: 'err' },
      // 라이선스 만료 경과 — 미갱신 만료 라이선스 사용은 컴플라이언스 위반. 만료 임박(창 안) 알림에서 이미 지난 건이 누락되던 공백.
      { label: '라이선스 만료 경과 (갱신 필요 · 위반 노출)', count: licOpt.expired.length, href: '/inventory/contracts?lic=expired', tone: 'err' },
      // 미사용 라이선스 회수 후보 — 사용률 60% 미만. 리스크(초과·만료)의 반대편 = 비용 절감 신호. 분석 화면 라이선스 최적화 패널과 같은 근거.
      { label: '미사용 라이선스 회수 후보 (비용 절감)', count: licOpt.under.length, href: '/inventory/contracts?lic=under', tone: 'warn' },
      // 라이선스 배정 밖 설치 — EDR 설치 인벤토리 대사(STEP2)에서 배정 좌석 없이 설치된 무단 사용. SAM 감사·법적 노출 리스크(좌석 배정 또는 제거 대상).
      { label: '라이선스 배정 밖 설치 (무단 사용 · SAM 리스크)', count: buildLicenseUsage().totalOffSeat, href: '/inventory/contracts?seat=off', tone: 'err' },
      // 미설치 좌석 — 좌석은 배정됐으나 설치가 관측되지 않은 자산. 배정 밖 설치(위험)의 반대편 = 회수 대상 낭비 좌석(비용 절감).
      { label: '라이선스 미설치 좌석 (좌석 회수 후보 · 비용 절감)', count: buildLicenseUsage().totalUnusedSeat, href: '/inventory/contracts?seat=unused', tone: 'warn' },
      // 유지보수 예산 초과·소진 임박 — 계약별 집행률 판정(§03 유지보수 비용 관리)을 담당자 일과 시작점으로 끌어올린다. 방치하면 예산 초과·조기 소진.
      { label: '유지보수 예산 초과·소진 임박 (재협상·집행 점검)', count: maint.rows.filter((r) => r.status === '예산 초과' || r.status === '소진 임박').length, href: '/inventory/contracts?maint=budget', tone: maint.overBudget > 0 ? 'err' : 'warn' },
      // 유지보수 미집행 — 계약액이 있는데 집행이 전혀 없는 계약(예산 통보의 반대편). 방치하면 계약액 실기·SLA 미이행. 이행 확인·독촉 대상.
      { label: '유지보수 미집행 (이행 확인·독촉)', count: maint.execAlert, href: '/inventory/contracts?maint=exec', tone: 'warn' },
      // 유지보수 SLA 위반 — 계약이 덮는 자산의 열린 수리가 SLA 대응 시한을 넘김(§03 유지보수 SLA 관리). 방치하면 계약상 서비스 수준 미이행. 공급사 SLA 이행 독촉 대상.
      { label: '유지보수 SLA 위반 (대응 시한 초과 · 이행 독촉)', count: maint.slaBreachAlert, href: '/inventory/contracts?maint=sla', tone: 'err' },
      // 구매 계약 발주 미이행 — 발주율 저조 + 만료 임박(§03 구매 계약 검수 연계). 방치하면 계약 미소진·예산 실기·정산 지연.
      { label: '구매 계약 발주 미이행 · 만료 임박 (이행 점검)', count: buildProcurement().atRisk.length, href: '/inventory/contracts?proc=risk', tone: 'err' },
      // 대장 정합성 미흡 — 소유자·시리얼·위치 등 핵심 필드 누락·불일치 자산(CMDB 신뢰도 저하). 필드 보정 필요.
      { label: '대장 정합성 미흡 (필드 누락·불일치)', count: s.assets.filter((a) => hasDataIssue(a, deptOfOwner(s.users))).length, href: '/assets/register?dq=1', tone: 'warn' },
      // 정례 리포트 배포 기한 경과 — 가동 스케줄의 예약 실행일이 지났는데 미배포(§05 리포트 자동화 정례 증적). 자동 생성 밀림.
      { label: '정례 리포트 배포 기한 경과 (자동 생성 밀림)', count: s.reportSchedules.filter(isScheduleOverdue).length, href: '/ai/reports?due=1', tone: 'warn' },
    )
    // 안전재고 미달 — 불출형 유형(단말·주변기기) 가용 재고가 안전재고 미만. 신규 배정 수요 스톡아웃 예방(발주 검토). 재고 화면과 같은 판정.
    const lowStock = lowStockCategories(s.assets, s.disposals, s.opsPolicy.safetyStock)
    if (lowStock.length > 0) {
      opsQueues.push({ label: `안전재고 미달 (발주 검토 — ${lowStock.map((r) => r.category).join('·')})`, count: lowStock.length, href: '/inventory/stock', tone: lowStock.some((r) => r.available === 0) ? 'err' : 'warn' })
    }
  }
  if (['SEC_MGR', 'ADMIN'].includes(session.role)) {
    // 수집 커넥터 지연·오류는 Discovery 수집 사각지대 — 해당 채널이 멎으면 미등록 자산·Shadow SaaS 가 안 잡힌다. 재연동 필요.
    const degradedConn = s.integrations.filter((i) => DEGRADED_CONNECTOR_STATUSES.includes(i.status))
    // 취약점 우선순위 P1 — 자산 중요도 × 노출도 스코어링(§05)의 즉시 조치 등급. 출처별 큐가 '얼마나'라면 이건 '무엇부터'.
    const p1 = buildVulnPriority().p1
    opsQueues.push(
      { label: '취약점 우선순위 P1 (즉시 조치)', count: p1, href: '/ai/insights?tier=p1', tone: 'err' },
      { label: '유출 · 침해 미조치', count: s.leaks.filter((l) => l.status !== '조치 완료').length, href: '/discovery/external?open=leaks', tone: 'err' },
      { label: '크리덴셜 노출 미조치 (인증 취약점)', count: s.credentials.filter((c) => c.status !== '조치 완료').length, href: '/discovery/external?open=creds', tone: 'err' },
      { label: 'IOC 상관 미조치 (위협 인텔·침해 징후)', count: s.iocMatches.filter((i) => !i.action).length, href: '/discovery/external?open=ioc', tone: 'err' },
      { label: '외부 노출 미조치', count: s.external.filter((e) => !e.action && e.state !== '등록·일치').length, href: '/discovery/external?open=exposure', tone: 'err' },
      { label: '휴면 계정 미처리 (AD/IdP 계정 위생)', count: s.accounts.filter((a) => !a.action).length, href: '/discovery/found?open=accounts', tone: 'warn' },
      // 소유자 확인 미응답 — 기한(운영 정책) 경과한 확인 요청은 격리 에스컬레이션 대상. 방치하면 미확인 자산이 계속 사내망에 남는다.
      { label: `소유자 확인 미응답 (${s.opsPolicy.confirmDeadlineDays}일 경과 · 격리 에스컬레이션)`, count: s.discovered.filter((d) => d.action === '확인요청' && d.confirmRequestedAt && -(daysUntil(d.confirmRequestedAt) ?? 0) >= s.opsPolicy.confirmDeadlineDays).length, href: '/discovery/found?await=overdue', tone: 'err' },
      { label: '미인가 SW 미조치 (EDR 정책 위반)', count: s.unauthorizedSw.filter((w) => !w.action).length, href: '/discovery/found?open=sw', tone: 'err' },
      // Shadow IT 판정 대기 — 카탈로그 검토중 SaaS 는 보안담당 판정(인가/차단)을 기다리는 정책 백로그(§01 보안담당: Shadow IT 판정·SaaS 정책 관리)
      { label: '미판정 SaaS (카탈로그 검토중 · 판정 대기)', count: s.saasCatalog.filter((x) => x.status === '검토중').length, href: '/settings/saas-catalog?status=review', tone: 'warn' },
      // 판정 기한 경과 — 검토중이 SLA 를 넘겨 방치된 건(소유자 확인 미응답과 동형 에스컬레이션). 기밀·민감 등급은 데이터 반출 위험 최우선.
      { label: `미판정 SaaS 판정 기한 경과 (${SAAS_REVIEW_SLA_DAYS}일 초과 · 에스컬레이션)`, count: buildSaasReview().overdue.length, href: '/settings/saas-catalog?status=overdue', tone: 'err' },
      { label: 'USB 정책 위반 미조치 (이동식 매체 DLP)', count: s.usbFindings.filter((u) => !u.action).length, href: '/discovery/found?open=usb', tone: 'err' },
      { label: '로컬 VM 위반 미조치 (엔드포인트 가상머신)', count: s.localVms.filter((v) => !v.action).length, href: '/discovery/found?open=localvm', tone: 'warn' },
      // 미관리 클라우드 리소스 — CSP API(채널 05)가 잡은 태그 미부착·개인 구독·미등록 리소스. 통제·정산 사각지대(태그·소유 지정 또는 회수 대상).
      { label: '미관리 클라우드 리소스 미조치 (태그·소유·회수 · SAM/거버넌스)', count: s.cloudFindings.filter((c) => !c.action).length, href: '/discovery/found?open=cloud', tone: 'err' },
      { label: '수집 커넥터 지연·오류 (Discovery 저하 · 재연동)', count: degradedConn.length, href: '/platform/integrations?conn=degraded', tone: degradedConn.some((i) => i.status === '오류') ? 'err' : 'warn' },
      // 알림 전달 실패 — 긴급 격리·에스컬레이션 문자/메일이 미도달(반송·게이트웨이 오류)한 건. 방치하면 야간·현장 대응이 지연되므로 재발송 필요(§06 발송 신뢰성).
      { label: '알림 전달 실패 (재발송 필요)', count: s.dispatches.filter((m) => m.deliveryStatus === '실패').length, href: '/platform/integrations?dispatch=failed', tone: 'err' },
      // 외부 공격표면 재탐지 기한 경과 — 도메인별 주기(스케줄러) 경과·미실행이면 외부 노출 관측에 사각(§04 재탐지 자동 반복). 재탐지 실행 대상.
      { label: '외부 공격표면 재탐지 기한 경과 (재탐지 지연 · Discovery 사각)', count: s.easmTargets.filter(isEasmRescanOverdue).length, href: '/discovery/external', tone: 'warn' },
      // 내부 수집 채널 재탐지 주기 경과 — 활성 채널인데 마지막 수집이 주기를 넘겼다(정체된 수집기 = 미등록 자산·Shadow IT 미탐지). EASM 재탐지 지연과 동형.
      { label: '탐지 채널 재탐지 주기 경과 (수집 지연 · Discovery 사각)', count: overdueScanChannels(s.scanPolicies, s.observations, nowMinute()).length, href: '/discovery/scan', tone: 'warn' },
    )
  }
  if (session.role === 'ADMIN') {
    // 필독 공지 확인 미달 — 발행된 필독(상단 고정) 공지 중 전 사용자가 읽음 확인하지 않은 것(§07 정책 전파·확인 증적).
    //  공지 등록·독촉은 Admin 책무 — 사용자 측 '미확인 필독' 넛지와 per-공지 미확인자 명단의 관리자 측 집계. 예약 발행(미래) 공지는 제외.
    // 대상 집단(전사/부서) 기준 미확인 — 전사 공지가 무관한 팀까지 분모에 넣어 미달을 부풀리던 것을 대상으로 좁힌다.
    const noticeGap = s.posts.filter((p) => {
      if (p.kind !== '공지' || !p.pinned || (p.publishAt && p.publishAt > today())) return false
      const targets = noticeTargets(p, s.users)
      const acked = new Set((p.acks ?? []).map((a) => a.by))
      return targets.some((u) => !acked.has(u.name))
    }).length
    opsQueues.push({ label: '필독 공지 확인 미달 (대상 독려 · 정책 전파 증적)', count: noticeGap, href: '/board/notices?gap=1', tone: 'warn' })
  }
  // 운영 대기 우선순위 — 긴급(err)을 주의(warn)보다 위로, 같은 등급은 적체 규모(count) 큰 순. 화면마다 흩어진 큐를
  //  담당자 일과 시작점에서 '무엇부터'가 바로 보이게 정렬한다(삽입 순서 그대로면 긴급·주의가 뒤섞인다).
  const TONE_RANK = { err: 0, warn: 1 } as const
  // 큐는 '가서 처리하라'는 링크다 — 매트릭스에서 그 화면 조회를 회수했으면 큐도 사라져야 한다.
  //  역할 게이트만 보면 조회를 회수한 화면의 큐가 남아 눌러도 대시보드로 되돌아오는 막다른 행이 된다.
  const opsActive = opsQueues
    .filter((q) => canViewMenu(q.href, session.role))
    .filter((q) => q.count > 0)
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.count - a.count)
  const opsErr = opsActive.filter((q) => q.tone === 'err').length
  const opsWarn = opsActive.filter((q) => q.tone === 'warn').length

  const expiring = [
    ...s.contracts.filter((c) => c.status !== '해지').map((c) => ({ id: c.id, name: c.name, kind: c.kind === '유지보수' ? '유지보수 계약' : '구매 계약', end: c.end, d: daysUntil(c.end) })),
    ...s.licenses.filter((l) => l.status !== '해지').map((l) => ({ id: l.id, name: l.name, kind: 'SW 라이선스', end: l.expiry, d: daysUntil(l.expiry) })),
  ]
    .filter((x) => x.d !== null && x.d <= s.opsPolicy.expiryWindowDays)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))

  const round = s.inventoryRounds.find((r) => r.status === '진행중')
  const topInsights = s.insights.filter((i) => i.status === '제안').slice(0, 3)
  // 최근 활동 — 감사 로그 최신 6건(관리자·담당자 한정, 감사 로그 접근 권한과 동일). 랜딩에서 변경 상황 훑기.
  const recentAudit = [...s.auditLogs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

  return (
    <>
      <ScreenHeader
        kicker="Main · Overview"
        title={`${session.name}님, 현황 요약입니다`}
        desc="자산 현황 · 미등록 자산 신규 발견 · 만료 임박 · My Work"
      />

      <div className="stat-row">
        <Stat value={s.assets.length.toLocaleString()} label="총 등록 자산" delta={{ text: `사용중 ${inUse} · 유휴/반납 ${idle}`, dir: 'flat' }} href="/assets/register" />
        <Stat value={newFound.length} label="미등록 신규 발견 (Shadow IT)" tone="err" delta={{ text: '소유자 확인·편입 필요', dir: 'up' }} href={session.role !== 'USER' ? '/discovery/found' : undefined} />
        <Stat value={expiring.length} label={`만료 임박 (계약·라이선스 ${s.opsPolicy.expiryWindowDays}일)`} tone="warn"
          delta={{ text: expiring.some((x) => (x.d ?? 0) < 0) ? `만료 ${expiring.filter((x) => (x.d ?? 0) < 0).length}건 포함` : `최단 ${expiring[0]?.d ?? '-'}일`, dir: 'flat' }}
          href={['ASSET_MGR', 'ADMIN'].includes(session.role) ? '/inventory/contracts' : undefined} />
        <Stat value={pendingApr.length} label="결재 대기" tone={overdueApr > 0 ? 'err' : 'accent'}
          delta={{ text: overdueApr > 0 ? `지연 ${overdueApr}건 (SLA ${s.opsPolicy.approvalSlaDays}일 초과)` : myQueue.length > 0 ? `내 결재 차례 ${myQueue.length}건` : `내 신청 ${myApr.length}건`, dir: overdueApr > 0 ? 'up' : 'flat' }}
          href="/workflow/approvals" />
        {round && (
          <Stat
            value={<>{roundProgressPct(round)}<small>%</small></>}
            label={`재물조사 진행률 — ${round.name.replace(' 정기 재물조사', '')}`}
            tone="ok"
            delta={{ text: `${round.scanned.toLocaleString()} / ${round.planned.toLocaleString()} 스캔`, dir: 'flat' }}
          />
        )}
      </div>

      <div className="cols main-side">
        <div className="vstack">
          {/* 미등록 발견(Shadow IT) 상세 목록은 발견 화면 권한(비-USER)에만 — USER 는 상단 요약 카운트만 보고 상세·드릴다운은 차단(discovery/found requireRole·전역 검색·어시스턴트와 동일 스코핑). 카드 본문이 tile href·action 과 달리 게이트를 빠뜨려 USER 에 호스트·위험도까지 유출되던 것을 닫는다. */}
          {session.role !== 'USER' && (
          <Card kicker="Discovery" title="미등록 자산 신규 발견" pad={false}
            actions={<Link className="btn sm" href="/discovery/found">전체 보기</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>발견 ID</th><th>호스트명</th><th>유형</th><th>채널</th><th>최초 발견</th><th className="c">위험도</th></tr>
                </thead>
                <tbody>
                  {newFound.map((d) => (
                    <tr key={d.id}>
                      <td className="code">{d.id}</td>
                      <td className="strong">{d.hostname}</td>
                      <td>{d.type}</td>
                      <td className="mute">{d.channel}</td>
                      <td className="tnum">{d.firstSeen}</td>
                      <td className="c"><RiskChip risk={d.risk} /></td>
                    </tr>
                  ))}
                  {newFound.length === 0 && <tr><td colSpan={6}><div className="empty">신규 발견 자산이 없습니다</div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          )}

          {/* 만료 임박(계약·라이선스) 상세도 계약 화면 권한(자산담당·Admin)에만 — USER·보안담당은 상단 카운트만. 계약 화면 requireRole·action 링크와 동일 스코핑(카드 본문 게이트 누락으로 USER 에 계약·라이선스명·만료일 유출되던 것 차단). */}
          {['ASSET_MGR', 'ADMIN'].includes(session.role) && (
          <Card kicker="Contracts · Licenses" title="만료 임박" pad={false}
            actions={<Link className="btn sm" href="/inventory/contracts">계약 · 라이선스</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>구분</th><th>대상</th><th>만료일</th><th className="num">잔여</th><th className="c">상태</th></tr>
                </thead>
                <tbody>
                  {expiring.map((x) => (
                    <tr key={x.id}>
                      <td className="mute">{x.kind}</td>
                      <td className="strong">{x.name}</td>
                      <td className="tnum">{x.end}</td>
                      <td className="num tnum">{x.d !== null && x.d < 0 ? '경과' : `${x.d}일`}</td>
                      <td className="c">
                        {x.d !== null && x.d < 0 ? <Chip tone="err">만료됨</Chip>
                          : x.d !== null && x.d <= 35 ? <Chip tone="err">갱신 시급</Chip>
                          : <Chip tone="warn">갱신 검토</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          )}
        </div>

        <div className="vstack">
          <Card kicker="My Work" title="내 작업"
            actions={myQueue.length > 0 ? <Link className="btn sm pri" href="/workflow/approvals">결재함 {myQueue.length} →</Link> : undefined}>
            <div className="vstack" style={{ gap: 10 }}>
              {unackedNotices.length > 0 && (
                <div className="vstack" style={{ gap: 6 }}>
                  <span className="kicker mute">미확인 필독 공지 — 확인 필요</span>
                  {unackedNotices.map((n) => (
                    <Link key={n.id} href={noticeHref(n.id)} className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Chip tone="err" bare>필독</Chip> {n.title}
                      </span>
                      <Chip tone="err">확인</Chip>
                    </Link>
                  ))}
                </div>
              )}
              {myOwnerConfirms.length > 0 && (
                <div className="vstack" style={{ gap: 6, borderTop: unackedNotices.length > 0 ? '1px solid var(--line)' : undefined, paddingTop: unackedNotices.length > 0 ? 10 : 0 }}>
                  <span className="kicker mute">소유자 확인 요청 — 응답 필요 (우리 부서)</span>
                  {myOwnerConfirms.map((a) => (
                    <Link key={a.id} href={approvalHref(a.id)} className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      <Chip tone="warn">응답</Chip>
                    </Link>
                  ))}
                </div>
              )}
              {myRejected.length > 0 && (() => {
                const above = unackedNotices.length > 0 || myOwnerConfirms.length > 0
                return (
                  <div className="vstack" style={{ gap: 6, borderTop: above ? '1px solid var(--line)' : undefined, paddingTop: above ? 10 : 0 }}>
                    <span className="kicker mute">반려된 내 신청 — 재상신 검토</span>
                    {myRejected.map((a) => (
                      <Link key={a.id} href={approvalHref(a.id)} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.title}{a.rejectReason ? <span className="dim" style={{ fontSize: 11 }}> · {a.rejectReason}</span> : ''}
                        </span>
                        <Chip tone="err">재상신</Chip>
                      </Link>
                    ))}
                  </div>
                )
              })()}
              {myReceipts.length > 0 && (() => {
                const above = unackedNotices.length > 0 || myOwnerConfirms.length > 0 || myRejected.length > 0
                return (
                  <div className="vstack" style={{ gap: 6, borderTop: above ? '1px solid var(--line)' : undefined, paddingTop: above ? 10 : 0 }}>
                    <span className="kicker mute">수령 확인 대기 — 인수 확인 필요</span>
                    {myReceipts.map((a) => (
                      <Link key={a.assetNo} href={`/assets/register?sel=${a.assetNo}`} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.model} <span className="dim" style={{ fontSize: 11 }}>· {a.assetNo}</span></span>
                        <Chip tone="warn">수령 확인</Chip>
                      </Link>
                    ))}
                  </div>
                )
              })()}
              {myQueue.length > 0 && (() => {
                const above = unackedNotices.length > 0 || myOwnerConfirms.length > 0 || myRejected.length > 0 || myReceipts.length > 0
                return (
                <div className="vstack" style={{ gap: 8, borderTop: above ? '1px solid var(--line)' : undefined, paddingTop: above ? 10 : 0 }}>
                  <span className="kicker mute">내 결재 차례 — 지금 처리 대기</span>
                  {myQueue.slice(0, 5).map((a) => (
                    <Link key={a.id} href="/workflow/approvals" className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      <span className="hstack" style={{ gap: 4, flex: 'none' }}>
                        {isApprovalOverdue(a, today(), s.opsPolicy.approvalSlaDays) && <Chip tone="err" bare>지연</Chip>}
                        <Chip tone="warn">{a.currentStep}</Chip>
                      </span>
                    </Link>
                  ))}
                  {myQueue.length > 5 && <span className="mut" style={{ fontSize: 12 }}>외 {myQueue.length - 5}건 — 결재함에서 전체 처리</span>}
                </div>
                )
              })()}
              <div className="vstack" style={{ gap: 8, borderTop: myQueue.length > 0 ? '1px solid var(--line)' : undefined, paddingTop: myQueue.length > 0 ? 10 : 0 }}>
                <span className="kicker mute">내 신청 — 진행 현황</span>
                {myApr.length > 0 ? myApr.map((a) => (
                  <div key={a.id} className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                    <Chip tone="info">{a.currentStep}</Chip>
                  </div>
                )) : <div className="mut">진행 중인 신청이 없습니다.</div>}
              </div>
              {myLoans.length > 0 && (
                <div className="vstack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="kicker mute">내 대여 자산 — 반환 기한</span>
                  {myLoans.map((l) => {
                    const dd = l.dday
                    const overdue = dd !== null && dd < 0
                    const tone = overdue ? 'err' : dd !== null && dd <= 7 ? 'warn' : 'neutral'
                    const label = dd === null ? '기한 없음' : overdue ? `연체 ${-dd}일` : dd === 0 ? '오늘 만기' : `D-${dd}`
                    return (
                      <Link key={l.assetNo} href={`/assets/register?q=${encodeURIComponent(l.assetNo)}`} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.model} <span className="dim" style={{ fontSize: 11 }}>· {l.dueDate}까지</span></span>
                        <Chip tone={tone}>{label}</Chip>
                      </Link>
                    )
                  })}
                </div>
              )}
              {myNotices.length > 0 && (
                <div className="vstack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="kicker mute">내게 온 알림 — 최근 수신 통지</span>
                  {myNotices.map((m) => {
                    const link = entityHref(m.ref)
                    const inner = (
                      <>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Chip tone={m.channel === '문자' ? 'warn' : 'neutral'} bare>{m.kind}</Chip> {m.subject}
                        </span>
                        <span className="dim" style={{ fontSize: 11, flex: 'none' }}>{m.at.slice(5, 10)}</span>
                      </>
                    )
                    return link
                      ? <Link key={m.id} href={link.href} {...(link.external ? { target: '_blank' } : {})} className="hstack" style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>{inner}</Link>
                      : <div key={m.id} className="hstack" style={{ justifyContent: 'space-between', gap: 12 }}>{inner}</div>
                  })}
                  {myNoticesAll.length > NOTICE_TOP && (showAllNotices
                    ? <Link className="mut" style={{ fontSize: 12 }} href="/dashboard">전체 {myNoticesAll.length}건 표시 중 — 최근 {NOTICE_TOP}건만 보기</Link>
                    : <Link className="mut" style={{ fontSize: 12 }} href="/dashboard?notices=all">외 {myNoticesAll.length - NOTICE_TOP}건 — 전체 보기</Link>)}
                </div>
              )}
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="dim">내 보유 자산</span>
                <Link href="/assets/register">{myAssets.length}대 조회 →</Link>
              </div>
            </div>
          </Card>

          <Card kicker="Board" title="최근 공지"
            actions={<Link className="btn sm ghost" href="/board/notices">공지 · QnA</Link>}>
            <div className="vstack" style={{ gap: 8 }}>
              {recentNotices.length > 0 ? recentNotices.map((n) => (
                <Link key={n.id} href={noticeHref(n.id)} className="hstack"
                  style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none' }}>
                  <span className="hstack" style={{ gap: 6, minWidth: 0 }}>
                    {n.pinned && <Chip tone="err" bare>필독</Chip>}
                    {n.category && <Chip tone="neutral" bare>{n.category}</Chip>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  </span>
                  <span className="dim tnum" style={{ fontSize: 11, flex: 'none' }}>{(n.publishAt ?? n.createdAt).slice(5, 10)}</span>
                </Link>
              )) : <div className="mut">공개된 공지가 없습니다.</div>}
            </div>
          </Card>

          {session.role !== 'USER' && (
            <Card kicker="Operations" title="운영 대기"
              actions={opsActive.length > 0 ? (
                <span className="hstack" style={{ gap: 6 }}>
                  {opsErr > 0 && <Chip tone="err" bare>긴급 {opsErr}</Chip>}
                  {opsWarn > 0 && <Chip tone="warn" bare>주의 {opsWarn}</Chip>}
                </span>
              ) : undefined}>
              <div className="vstack" style={{ gap: 8 }}>
                {opsActive.length > 0 ? opsActive.map((q) => (
                  <Link key={q.label} href={q.href} className="hstack"
                    style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                    <span>{q.label}</span>
                    <span className="hstack" style={{ gap: 6 }}><Chip tone={q.tone}>{q.count}</Chip><span className="mut">→</span></span>
                  </Link>
                )) : <div className="mut">처리 대기 중인 운영 작업이 없습니다.</div>}
              </div>
            </Card>
          )}

          {['ASSET_MGR', 'ADMIN'].includes(session.role) && (
            <Card kicker="Planning" title="다가오는 일정 (향후 14일)"
              actions={upcoming.length > 0 ? <Chip tone="info" bare>{upcoming.length}건</Chip> : undefined}>
              <div className="vstack" style={{ gap: 7 }}>
                {upcoming.length > 0 ? (showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_TOP)).map((u, i) => (
                  <Link key={i} href={u.href} className="hstack"
                    style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none', alignItems: 'baseline' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span className="mut tnum" style={{ fontSize: 11 }}>{u.date.slice(5)}</span> <Chip tone={u.tone} bare>{u.kind}</Chip> <span style={{ fontSize: 12 }}>{u.label}</span>
                    </span>
                    <span className="hstack" style={{ gap: 6 }}><span className="mut tnum" style={{ fontSize: 11 }}>D-{u.dday}</span><span className="mut">→</span></span>
                  </Link>
                )) : <div className="mut">향후 14일 예정된 정비·갱신·대여 반환·입고·조사·리포트 일정이 없습니다.</div>}
                {upcoming.length > UPCOMING_TOP && (showAllUpcoming
                  ? <Link className="dim" style={{ fontSize: 11.5 }} href="/dashboard">전체 {upcoming.length}건 표시 중 (날짜순) — 가까운 {UPCOMING_TOP}건만 보기</Link>
                  : <Link className="dim" style={{ fontSize: 11.5 }} href="/dashboard?upcoming=all">… 외 {upcoming.length - UPCOMING_TOP}건 (날짜순) — 전체 보기</Link>)}
              </div>
            </Card>
          )}

          {session.role !== 'USER' && (
            <Card kicker="Activity" title="최근 활동"
              actions={<Link className="btn sm ghost" href="/platform/integrations">감사 로그</Link>}>
              <div className="vstack" style={{ gap: 7 }}>
                {recentAudit.length > 0 ? recentAudit.map((a) => (
                  <Link key={a.id} href="/platform/integrations" className="hstack"
                    style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none', alignItems: 'baseline' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span className="mut tnum" style={{ fontSize: 11 }}>{a.at.slice(5, 16)}</span> <b style={{ fontSize: 12 }}>{a.actor}</b> <span style={{ fontSize: 12 }}>{a.action}</span>
                    </span>
                    {a.result === '실패' && <Chip tone="err" bare>실패</Chip>}
                  </Link>
                )) : <div className="mut">최근 활동이 없습니다.</div>}
              </div>
            </Card>
          )}

          <Card kicker="AI Intelligence" title="AI 제안 Top 3"
            /* 사용자 권한그룹은 AI 제안 화면을 열 수 없다 — 카드(요약)는 그대로 두되 '전체' 링크는 내주지 않는다(막다른 길 방지) */
            actions={session.role !== 'USER' ? <Link className="btn sm ghost" href="/ai/insights">전체</Link> : undefined}>
            <div className="vstack" style={{ gap: 12 }}>
              {topInsights.map((i) => (
                <div key={i.id}>
                  <div className="hstack" style={{ gap: 6 }}>
                    <RiskChip risk={i.severity} />
                    <span className="kicker mute">{i.kind}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{i.title}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* QnA — 공지는 위 '최근 공지' 위젯이 담당하므로 여기선 QnA 만. 담당자는 답변 대기, 사용자는 본인 문의 답변 현황(§01 Main/Home 공지·QnA · 로7 문의→답변의 작성자 측). */}
          <Card kicker="Q&A" title="QnA"
            actions={<Link className="btn sm ghost" href="/board/qna">전체</Link>}>
            <div className="vstack" style={{ gap: 8 }}>
              {session.role !== 'USER'
                ? (() => {
                    const waiting = s.posts.filter((p) => p.kind === 'QnA' && !p.answer)
                    const overdue = waiting.filter((p) => isQnaOverdue(p))
                    return waiting.length > 0 ? (
                      <>
                        <Link href="/board/qna?status=대기" className="hstack" style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                          <span className="hstack" style={{ gap: 6 }}><Chip tone="warn" bare>답변 대기</Chip> 사용자 문의</span>
                          <span><b>{waiting.length}</b>건 →</span>
                        </Link>
                        {overdue.length > 0 && (
                          <Link href="/board/qna?overdue=1" className="hstack" style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                            <span className="hstack" style={{ gap: 6 }}><Chip tone="err" bare>SLA 경과</Chip> 미답변 지연 (답변 독촉)</span>
                            <span><b>{overdue.length}</b>건 →</span>
                          </Link>
                        )}
                      </>
                    ) : <div className="mut">답변 대기 중인 문의가 없습니다.</div>
                  })()
                : (() => {
                    const myQna = s.posts.filter((p) => p.kind === 'QnA' && p.author === session.name)
                    const answered = myQna.filter((p) => p.answer)
                    if (myQna.length === 0) return <div className="mut">등록한 문의가 없습니다. 궁금한 점은 QnA에 남겨 주세요.</div>
                    return (
                      <>
                        <div className="hstack" style={{ justifyContent: 'space-between' }}>
                          <span>내 문의</span><span className="dim"><b>{myQna.length}</b>건 · 답변 완료 {answered.length}건</span>
                        </div>
                        {answered.slice(0, 3).map((p) => (
                          <Link key={p.id} href={qnaHref(p.id)} className="hstack"
                            style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                            <span className="hstack" style={{ gap: 6, minWidth: 0 }}>
                              <Chip tone="ok" bare>답변</Chip>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                            </span>
                            <span className="dim tnum" style={{ fontSize: 11, flex: 'none' }}>{p.answer!.at.slice(5)}</span>
                          </Link>
                        ))}
                      </>
                    )
                  })()}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
