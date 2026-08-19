import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { Icon } from '@/components/chrome/Icon'
import { effectiveRoles, requireMenu } from '@/lib/authz'
import { currentYear, today } from '@/lib/dates'
import { compliancePostureScore, computeComplianceKpis, postureRating } from '@/lib/compliance'
import { computeFinanceKpis } from '@/lib/finance'
import { computeInfraHealth } from '@/lib/infra'
import { computeProjectPmo } from '@/lib/projects'
import { computeDrKpis } from '@/lib/dr'
import { computePolicyKpis } from '@/lib/policy'
import { computeRiskKpis } from '@/lib/risk'
import { delayedSrs } from '@/lib/sr'
import { eligibleForCourse, getStore, highSevOpen, isRemoteTargetIn, remotePeriodKey } from '@/lib/store'
import { SR_CHIP, srStatusLabel } from '../sr/chips'

export default async function DashboardPage() {
  const me = await requireMenu('/dashboard')
  const s = getStore()
  const period = today().slice(0, 7)
  // 전사 스냅샷 각 타일은 그 신호의 출처 화면과 동일한 유효권한(menus.ts ∩ 런타임 메뉴권한 제한)으로
  // 노출한다 — 정적 role 검사로 잡으면, ADMIN 이 메뉴권한 화면에서 특정 도메인을 제한해 담당자를 그
  // 화면에서 리다이렉트시켜도 대시보드 집계 타일로 같은 수치가 새어 나간다(출처 화면과 게이트 불일치).
  const canSee = (href: string) => effectiveRoles(href).includes(me.role)
  const opsVis = {
    incidents: canSee('/infra/incidents'),
    delayedSr: canSee('/sr/delayed'),
    openIssues: canSee('/projects/schedule'),
    unsigned: canSee('/pledge/manage'),
    inspections: canSee('/compliance/inspection'),
    securityReviews: canSee('/compliance/security-review'),
    risks: canSee('/compliance/risks'),
    policies: canSee('/compliance/policies'),
    dr: canSee('/compliance/dr'),
    // 인프라 헬스 — 배치·인터페이스는 운영 화면, 디스크는 시스템 화면이 출처(각 출처 유효권한으로 게이트)
    infraOps: canSee('/infra/operations'),
    infraSys: canSee('/infra/systems'),
    // 재무 집행률 — 타일은 전사 집계 수치라, 운영 스냅샷과 같은 담당·Admin 관리 시야(/sr/manage=IT운영 종합
    // export 게이트)로만 노출한다. 개별 재무 화면은 역할 스코프 접근이 열려 있으나(canSee 로 게이트하면
    // USER·DEPT_MGR 도 잡혀 스냅샷 노출 불변이 깨진다) 여기 타일은 전사 수치이므로 관리자 게이트로 제한.
    financeExec: canSee('/sr/manage'),
  }
  const showOps = Object.values(opsVis).some(Boolean)
  // 공지사항 카드도 출처 화면(/board/notices) 유효권한을 따른다 — 기본 roles:ALL 이라 평상시 전원 노출이나,
  // ADMIN 이 공지 메뉴를 특정 역할에서 제한하면 그 역할은 게시판에서 리다이렉트되므로 대시보드 미리보기도
  // 함께 숨겨 런타임 제한을 일관 적용한다(v1.5.87 교차도메인 게이트 클래스 완결).
  const canSeeNotices = canSee('/board/notices')

  const myTodos = s.todos.filter((t) => t.owner === me.name && !t.done)
  const myApprovals = s.approvals.filter((a) => a.approver === me.name && a.status === '대기')
  const mySr = s.srRequests.filter((r) => r.requester === me.name && r.status !== '완료' && r.status !== '반려')
  // '일반 서약' 타일은 일반 서약 유효 여부(validSign 단일 원천: kind '일반' + 현 개정본 이후 서명)로 판정한다.
  // '보안서약서' 할일 유무로 잡으면 관리책임자·재택·특별·프로젝트 서약 재서약 할일(모두 kind '보안서약서',
  // 제목만 다름)에도 반응해, 일반 서약이 유효한 사람이 무관한 유형 개정 때 '미제출'로 오표기된다(교차 신호).
  const generalRevisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const generalSigned = s.pledges.some((p) =>
    p.name === me.name && p.year === currentYear() && p.kind === '일반' && p.signedAt >= generalRevisedAt)
  // 게시판 화면(board/notices)과 동일한 정렬 — 고정 우선, 동순위는 게시일 내림차순. postedAt 보조키가 없으면
  // 손상 파일의 비불리언 pinned("true")로 Number()가 NaN 이 돼 비교자가 불안정 정렬을 내던 결함(게시판은
  // '|| localeCompare' 폴백으로 안전, 대시보드만 누락)까지 함께 정합화한다.
  const notices = [...s.notices].sort((a, b) =>
    Number(b.pinned ?? false) - Number(a.pinned ?? false) || String(b.postedAt ?? '').localeCompare(String(a.postedAt ?? '')))

  // 관리대상 현황 — 의식제고·컴플라이언스·계획수립 (요구사항 개인별현황 포틀릿)
  // 재택은 등록 주기(월·분기·반기·매일) 기반 기간 키를 쓴다 — 인프라 점검은 월(period) 그대로.
  const remotePeriod = remotePeriodKey(s.remoteCycle)
  const remoteDone = s.remoteChecks.some((r) => r.name === me.name && r.period === remotePeriod)
  const remoteTarget = s.remoteTargets.some((t) => t.name === me.name && isRemoteTargetIn(t, remotePeriod))
  const eduDone = s.educationCourses.filter((c) => c.status === '완료')
  // 과정 대상(전임직원/개발자/보안담당자)을 반영해 내가 이수 의무자인 과정만 '미이수'로 센다 — 대상을
  // 무시하면 개발자 전용 과정이 비개발자 대시보드에 '미이수'로 오표기된다(v1.5.51 이수율 단일 원천
  // eligibleForCourse 를 대시보드 포틀릿에도 적용, 교육 화면과 정합).
  const myEduMissing = eduDone.filter((c) =>
    eligibleForCourse(s, c.target).some((p) => p.name === me.name) &&
    !s.educationRecords.some((r) => r.courseId === c.id && r.name === me.name)).length
  const myViolations = s.violations.filter((v) => v.name === me.name && v.status === '징구중').length
  const myPlansDraft = s.investPlans.filter((p) => p.owner === me.name && p.status === '작성중').length

  // 전사 운영 스냅샷 (업무담당·Admin) — 미서약 집계도 위 개인 타일과 같은 일반 서약 기준(단일 원천)
  const signedNames = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= generalRevisedAt).map((p) => p.name))
  // 프로젝트 PMO — 오픈 이슈·높은 리스크(lib/projects 단일원천, schedule 화면과 정합).
  const pmo = computeProjectPmo(s)
  // 정보보호 위험 — 높음↑ 미종결·기한 경과(lib/risk 단일원천, 위험관리대장 KPI 와 정합)
  const riskKpis = computeRiskKpis(s.riskItems, today())
  // 정책 재검토 경과 — 시행 정책 재검토 예정일 초과(lib/policy 단일원천, 정책 관리대장 KPI 와 정합)
  const policyKpis = computePolicyKpis(s.securityPolicies, today())
  // 복구훈련 경과 — 복구계획 훈련 예정일 초과(lib/dr 단일원천, 재해복구 관리대장 KPI 와 정합)
  const drKpis = computeDrKpis(s.drPlans, today())
  const ops = {
    incidents: s.incidents.filter((i) => i.status === '조치중').length,
    delayedSr: delayedSrs(s).length,
    openIssues: pmo.openIssues,
    projectHighRisk: pmo.highRiskOpen,
    unsigned: s.people.filter((p) => !signedNames.has(p.name)).length,
    inspections: s.inspectionPlans.filter((p) => p.status === '결과미등록' || (p.month < period && p.status === '계획')).length,
    // 미조치 취약점 — 열린(미완료) 보안성 검토의 발견 대비 미조치 잔여. 화면(security-review)의 openFindings 와 동일 원천.
    securityReviews: s.securityReviews.filter((r) => r.status !== '완료').reduce((sum, r) => sum + Math.max(0, r.findings - r.fixed), 0),
    // 고위험(심각+높음) 미조치 — 우선 조치 신호. highSevOpen 단일원천(화면·export 와 정합).
    securityHigh: s.securityReviews.filter((r) => r.status !== '완료').reduce((sum, r) => sum + highSevOpen(r), 0),
    // 컴플라이언스 포스처 점수 — 경영 보고용 단일 지표(lib/compliance 단일원천, 추세 화면과 정합).
    complianceScore: compliancePostureScore(computeComplianceKpis(s)),
    // 정보보호 위험 — 높음↑(≥10) 미종결 우선처리 신호 + 기한 경과(lib/risk 단일원천, 위험관리대장과 정합).
    riskHighOpen: riskKpis.highOpen,
    riskOverdue: riskKpis.overdue,
    // 정책 재검토 경과 — 주기적 재검토(ISMS 관리체계 1.1) 미이행 신호.
    policyOverdue: policyKpis.overdue,
    // 복구훈련 경과 — 정기 복구훈련(ISMS 2.12) 미이행 신호.
    drOverdue: drKpis.overdue,
  }
  // 인프라 운영 헬스 — 배치 실패·인터페이스 오류·디스크 경고(lib/infra 단일원천, 운영·시스템 화면과 정합).
  const infra = computeInfraHealth(s)
  // 재무 집행률 — 투자·비용 계획 대비 집행(lib/finance 단일원천, 재무 화면·IT운영 종합 export 와 정합).
  const finExec = (kind: '투자' | '비용') => {
    const contracts = s.investContracts.filter((c) => c.kind === kind)
    const settlements = s.settlements.filter((x) => contracts.some((c) => c.id === x.contractId))
    return computeFinanceKpis(s.investPlans.filter((p) => p.kind === kind), contracts, settlements).execRate
  }

  return (
    <>
      <ScreenHeader kicker="Main" title="개인별현황"
        desc={`${me.name} 님의 관리대상 현황 — 보안신청 · 의식제고 · 계획 · 컴플라이언스 · My Work`} />

      <div className="stat-row">
        <Stat value={myTodos.length} label="나의 할일" tone={myTodos.length > 0 ? 'warn' : undefined} note="기한 도래 순" />
        <Stat value={myApprovals.length} label="결재 대기" tone={myApprovals.length > 0 ? 'err' : undefined} note="내가 결재자" />
        <Stat value={mySr.length} label="진행중 SR" note="완료·반려 제외" />
        <Stat value={generalSigned ? '완료' : '미제출'} label="보안서약서" tone={generalSigned ? undefined : 'err'} note={`${currentYear()}년 일반 서약`} />
      </div>

      {/* 관리대상 현황 — 의식제고 · 컴플라이언스 · 계획수립 */}
      <div className="stat-row">
        <Stat value={!remoteTarget ? '대상 아님' : remoteDone ? '제출' : '미제출'} label="재택 체크리스트"
          tone={remoteTarget && !remoteDone ? 'warn' : undefined} note={period} />
        <Stat value={myEduMissing} label="보안교육 미이수" tone={myEduMissing > 0 ? 'err' : undefined} note="완료 과정 기준" />
        <Stat value={myViolations} label="보안위반 확인서 대상" tone={myViolations > 0 ? 'err' : undefined} />
        <Stat value={myPlansDraft} label="계획수립 작성중" note="투자·비용 과제" />
      </div>

      {showOps && (
        <Card title="전사 운영 스냅샷" kicker="Operations" pad={false}
          actions={canSee('/sr/manage') ? <a className="btn sm" href="/api/export?type=itops-summary" title="SR·장애·프로젝트·투자/비용 집행 종합 현황">IT 운영 종합 현황</a> : undefined}>
          <div className="stat-row" style={{ border: 'none' }}>
            {opsVis.inspections && <Stat value={<>{ops.complianceScore}<small>/100</small></>} label="컴플라이언스 점수" note={postureRating(ops.complianceScore).label} tone={postureRating(ops.complianceScore).tone === 'err' ? 'err' : postureRating(ops.complianceScore).tone === 'warn' ? 'warn' : undefined} />}
            {opsVis.incidents && <Stat value={ops.incidents} label="조치중 장애" tone={ops.incidents > 0 ? 'err' : undefined} />}
            {opsVis.infraOps && <Stat value={infra.failedBatches} label="배치 실패" tone={infra.failedBatches > 0 ? 'err' : undefined} />}
            {opsVis.infraOps && <Stat value={infra.brokenIfs} label="인터페이스 오류" tone={infra.brokenIfs > 0 ? 'err' : undefined} />}
            {opsVis.infraSys && <Stat value={infra.diskWarns} label="디스크 경고" tone={infra.diskWarns > 0 ? 'err' : undefined} />}
            {opsVis.delayedSr && <Stat value={ops.delayedSr} label="지연 SR" tone={ops.delayedSr > 0 ? 'warn' : undefined} />}
            {opsVis.openIssues && <Stat value={ops.openIssues} label="프로젝트 오픈 이슈" tone={ops.openIssues > 0 ? 'warn' : undefined} />}
            {opsVis.openIssues && <Stat value={ops.projectHighRisk} label="프로젝트 높은 리스크" tone={ops.projectHighRisk > 0 ? 'err' : undefined} />}
            {opsVis.unsigned && <Stat value={ops.unsigned} label="미서약 인원" tone={ops.unsigned > 0 ? 'warn' : undefined} />}
            {opsVis.inspections && <Stat value={ops.inspections} label="점검 미등록 · 경과" tone={ops.inspections > 0 ? 'warn' : undefined} />}
            {opsVis.securityReviews && <Stat value={ops.securityHigh} label="고위험 미조치" tone={ops.securityHigh > 0 ? 'err' : undefined} />}
            {opsVis.securityReviews && <Stat value={ops.securityReviews} label="미조치 취약점" tone={ops.securityReviews > 0 ? 'warn' : undefined} />}
            {opsVis.risks && <Stat value={ops.riskHighOpen} label="높음↑ 미종결 위험" tone={ops.riskHighOpen > 0 ? 'err' : undefined} note="정보보호 위험평가" />}
            {opsVis.risks && ops.riskOverdue > 0 && <Stat value={ops.riskOverdue} label="위험 조치기한 경과" tone="warn" />}
            {opsVis.policies && <Stat value={ops.policyOverdue} label="정책 재검토 경과" tone={ops.policyOverdue > 0 ? 'err' : undefined} note="정책·지침" />}
            {opsVis.dr && <Stat value={ops.drOverdue} label="복구훈련 경과" tone={ops.drOverdue > 0 ? 'err' : undefined} note="재해복구" />}
            {opsVis.financeExec && <Stat value={`${finExec('투자')}%`} label="투자 집행률" note="계획 대비" />}
            {opsVis.financeExec && <Stat value={`${finExec('비용')}%`} label="비용 집행률" note="계획 대비" />}
          </div>
        </Card>
      )}

      <div className="cols c2">
        <Card title="나의 할일" kicker="My Work"
          actions={<Link className="btn sm" href="/work/todo">전체 보기</Link>} pad={false}>
          {myTodos.length === 0 ? (
            <div className="empty">처리할 할일이 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>유형</th><th>제목</th><th>기한</th></tr></thead>
                <tbody>
                  {myTodos.map((t) => (
                    <tr key={t.id}>
                      <td><Chip tone="neutral" bare>{t.kind}</Chip></td>
                      <td className="strong">{t.title}</td>
                      <td className="tnum">{t.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {canSeeNotices && (
        <Card title="공지사항" kicker="Board"
          actions={<Link className="btn sm" href="/board/notices">전체 보기</Link>} pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>분류</th><th>제목</th><th>게시일</th></tr></thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id}>
                    <td><Chip tone={n.category === '보안' ? 'err' : n.category === '시스템' ? 'info' : n.category === '교육' ? 'ok' : 'neutral'} bare>{n.category}</Chip></td>
                    <td className={n.pinned ? 'strong' : ''}>{n.pinned && <Icon name="pin" size={12} aria-label="고정" style={{ marginRight: 4, verticalAlign: '-1px' }} />}{n.title}</td>
                    <td className="tnum mute">{n.postedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        )}
      </div>

      <div className="cols c2">
        <Card title="결재 대기" kicker="Approvals"
          actions={<Link className="btn sm" href="/work/approvals">결재함</Link>} pad={false}>
          {myApprovals.length === 0 ? (
            <div className="empty">대기 중인 결재가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>문서</th><th>제목</th><th>기안자</th><th>상신일</th></tr></thead>
                <tbody>
                  {myApprovals.map((a) => (
                    <tr key={a.id}>
                      <td><Chip tone="info" bare>{a.docType}</Chip></td>
                      <td className="strong">{a.title}</td>
                      <td>{a.drafter} <span className="mut">· {a.dept}</span></td>
                      <td className="tnum">{a.draftedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="나의 SR 진행현황" kicker="IT Request"
          actions={<Link className="btn sm" href="/sr/requests">신청내역</Link>} pad={false}>
          {mySr.length === 0 ? (
            <div className="empty">진행 중인 SR이 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>SR번호</th><th>제목</th><th>상태</th><th>요청일</th></tr></thead>
                <tbody>
                  {mySr.map((r) => (
                    <tr key={r.srNo}>
                      <td className="code">{r.srNo}</td>
                      <td className="strong">{r.title}</td>
                      <td><Chip tone={SR_CHIP[r.status]}>{srStatusLabel(r)}</Chip></td>
                      <td className="tnum">{r.requestedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
