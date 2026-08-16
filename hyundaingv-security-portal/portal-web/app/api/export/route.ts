/** 엑셀 다운로드 API — 요구사항 '엑셀 ◎' 화면의 목록을 CSV(BOM)로 내린다.
 *  화면과 동일한 권한·데이터 스코핑을 서버에서 재적용한다(시큐어 코딩). */
import { effectiveRoles } from '@/lib/authz'
import { csvResponse } from '@/lib/csv'
import { currentYear, today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { compliancePostureScore, computeComplianceKpis, complianceKpiPct, postureRating, weakestPostureAxis } from '@/lib/compliance'
import { computeFinanceKpis } from '@/lib/finance'
import { computeInfraHealth, DISK_WARN } from '@/lib/infra'
import { eligibleForCourse, getStore, isRemoteTargetIn, remotePeriodKey } from '@/lib/store'
import type { Role } from '@/lib/types'

/** 유형 → 소속 화면 — 화면의 런타임 메뉴 제한이 다운로드에도 걸린다 (유형별 추가 가드와 별개) */
const EXPORT_MENU: Record<string, string> = {
  'invest-actual': '/finance/invest', 'expense-actual': '/finance/expense', 'expense-flash': '/finance/expense',
  'sr-requests': '/sr/requests', 'ci-srs': '/sr/ci',
  incidents: '/infra/incidents', changes: '/infra/changes', projects: '/projects/status',
  'project-issues': '/projects/schedule', deliverables: '/projects/schedule',
  printouts: '/awareness/prints', violations: '/awareness/violations',
  'inspection-plans': '/compliance/inspection', 'inspection-items': '/compliance/inspection',
  racks: '/infra/racks', hardware: '/infra/racks', servers: '/infra/systems', systems: '/infra/systems',
  batches: '/infra/operations', interfaces: '/infra/operations',
  'education-records': '/compliance/education', 'pledge-status': '/pledge/dept',
  'security-reviews': '/compliance/security-review',
  'compliance-summary': '/compliance/inspection',
  'compliance-trend': '/compliance/inspection',
  'itops-summary': '/sr/manage',
  'remote-status': '/awareness/remote', audit: '/settings/audit',
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('unauthorized', { status: 401 })
  const type = new URL(req.url).searchParams.get('type') ?? ''
  const s = getStore()
  const role: Role = session.role
  const isMgr = role === 'BIZ_MGR' || role === 'ADMIN'

  const ownerHref = EXPORT_MENU[type]
  if (ownerHref && !effectiveRoles(ownerHref).includes(role)) return new Response('forbidden', { status: 403 })

  // 재무 리포트(전사 계획대비실적·속보)는 관리자급(부서담당 이상)만 — 일반 사용자 차단(화면과 동일 스코프)
  if ((type === 'invest-actual' || type === 'expense-actual' || type === 'expense-flash') && role === 'USER') {
    return new Response('forbidden', { status: 403 })
  }

  if (type === 'invest-actual' || type === 'expense-actual') {
    // 계획대비실적(투자·비용) — 조회·엑셀 전 권한 (요구사항 조회 ●, 엑셀 ◎)
    const kind = type === 'invest-actual' ? '투자' : '비용'
    const confirmed = s.investPlans.filter((p) => p.kind === kind && p.status === '확정')
    // 컬럼 명사는 kind 에 맞춘다 — 투자=과제, 비용=항목(화면 노운과 일치). 공유 헤더는 비용을 과제로 오표기했다.
    const noun = kind === '투자' ? '과제' : '항목'
    const rows: (string | number)[][] = [[`${noun}번호`, `${noun}명`, '담당', '계획액(만원)', '계약액(만원)', '집행액(만원)', '집행률(%)']]
    for (const p of confirmed) {
      // 화면과 동일하게 kind 로 먼저 스코프 — 전역 planId 유일성에만 의존하지 않고 교차-kind 집계를 원천 차단
      const cts = s.investContracts.filter((c) => c.planId === p.id && c.kind === kind)
      const contracted = cts.reduce((sum, c) => sum + c.amount, 0)
      const paid = cts.reduce((sum, c) => sum + s.settlements
        .filter((x) => x.contractId === c.id && x.status === '지급완료')
        .reduce((sm, x) => sm + x.amount, 0), 0)
      rows.push([p.id, p.title, `${p.owner}(${p.dept})`, p.amount, contracted, paid, p.amount ? Math.round((paid / p.amount) * 100) : 0])
    }
    return csvResponse(`${kind}_계획대비실적`, rows)
  }

  if (type === 'education-records') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const done = s.educationCourses.filter((c) => c.status === '완료')
    const rows: (string | number)[][] = [['이름', '부서', ...done.map((c) => c.title), '이수율(%)']]
    for (const p of s.people) {
      // 과정 대상별 이수 의무 반영 — 비대상자는 '해당없음', 이수율은 대상 과정만 분모로 (화면과 동일)
      const marks = done.map((c) => !eligibleForCourse(s, c.target).some((e) => e.name === p.name) ? '해당없음'
        : s.educationRecords.some((r) => r.courseId === c.id && r.name === p.name) ? '이수' : '미이수')
      const req = marks.filter((m) => m !== '해당없음').length
      const n = marks.filter((m) => m === '이수').length
      // 100% 는 대상 과정 전원 이수일 때만 — 화면 전사 이수율과 동일하게 Math.round 의 거짓 100 을 막는다.
      // 대상 과정이 없으면(req=0) '해당없음' — 전 셀이 '해당없음'인 비대상자를 100% 이수로 오표기하지 않는다
      // (감사용 이수현황에서 '전원 이수 완료'와 '이수 의무 없음'을 이수율 열만으로 구분 가능하게 한다).
      rows.push([p.name, p.dept, ...marks, req ? (n >= req ? 100 : Math.min(99, Math.round((n / req) * 100))) : '해당없음'])
    }
    return csvResponse('보안교육_이수현황', rows)
  }

  if (type === 'pledge-status') {
    if (role === 'USER') return new Response('forbidden', { status: 403 })
    const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
    const signed = new Map(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => [p.name, p]))
    // 부서담당은 소속 부서만 — 화면과 동일 스코핑
    const scope = s.people.filter((p) => role !== 'DEPT_MGR' || p.dept === session.dept)
    const rows: (string | number)[][] = [['이름', '부서', '상태', '제출일', '방식']]
    for (const p of scope) {
      const sig = signed.get(p.name)
      rows.push([p.name, p.dept, sig ? '서약 완료' : '미서약', sig?.signedAt?.slice(0, 10) ?? '-', sig?.method ?? '-'])
    }
    return csvResponse('보안서약_현황', rows)
  }

  if (type === 'remote-status') {
    if (role === 'USER') return new Response('forbidden', { status: 403 })
    // 기간별 조회 (요구사항 54행) — period 파라미터 기간의 재택 대상자 명단 기준, 화면과 동일 스코핑.
    // 기본은 현 등록 주기(매일·월·분기·반기)의 기간 키 — 화면 링크가 넘기는 주기 키와 정합.
    const periodParam = new URL(req.url).searchParams.get('period') ?? ''
    const period = periodParam || remotePeriodKey(s.remoteCycle)
    const submitted = s.remoteChecks.filter((r) => r.period === period)
    // 재직자 교집합 — 화면(remote/page.tsx)과 동일하게, syncHr 로 s.people 에서 빠진 퇴사 재택 대상자를
    // 현황에서 제외한다(종료일 없는 유령 미제출이 export 에도 새지 않게, 인사연동 감사 v1.5.90).
    const scopeRaw = s.remoteTargets.filter((t) =>
      isRemoteTargetIn(t, period) && s.people.some((p) => p.name === t.name) && (role !== 'DEPT_MGR' || t.dept === session.dept))
    // 화면과 동일하게 이름 기준 중복 제거 — 경계월 인접 기간으로 한 사람이 둘 잡히는 이중 집계 방지
    const scope = scopeRaw.filter((t, i) => scopeRaw.findIndex((x) => x.name === t.name) === i)
    const rows: (string | number)[][] = [['이름', '부서', '재택기간', `${period} 상태`, '제출일']]
    for (const t of scope) {
      const r = submitted.find((x) => x.name === t.name)
      rows.push([t.name, t.dept, `${t.startDate} ~ ${t.endDate ?? '계속'}`, r ? '제출' : '미제출', r?.submittedAt ?? '-'])
    }
    return csvResponse('재택근무_체크리스트_현황', rows)
  }

  // ── 엑셀 ◎ 확대 (요구사항 15·22~27·36~44·55·56·63행) — 각 화면과 동일 권한·스코핑 ──

  if (type === 'expense-flash') {
    // 속보(비용) — 기준금액은 화면과 동일하게 정산 > 계약 > 계획 우선순위
    const kindContracts = s.investContracts.filter((c) => c.kind === '비용')
    const rows: (string | number)[][] = [['월', '거래처', '연동 항목', '예상액(만원)', '기준', '기준금액(만원)']]
    for (const f of s.expenseFlashes) {
      const paid = s.settlements
        .filter((x) => x.status === '지급완료' && x.requestedAt.slice(0, 7) === f.month &&
          kindContracts.find((c) => c.id === x.contractId)?.vendor === f.vendor)
        .reduce((sum, x) => sum + x.amount, 0)
      const basis = paid > 0 ? '정산' : kindContracts.some((c) => c.vendor === f.vendor) ? '계약' : '계획'
      // kind 로 스코프 — 화면과 달리 export 는 plan.title 을 해석하므로, 손상/주입 상태에서 flash.planId 가
      // 투자 계획을 가리키면 비용 속보에 투자 과제명이 새어 나온다(route:45 원칙: 전역 planId 유일성 미의존)
      const plan = f.planId ? s.investPlans.find((p) => p.id === f.planId && p.kind === '비용') : undefined
      rows.push([f.month, f.vendor, plan?.title ?? '-', f.expected, basis, basis === '정산' ? paid : f.expected])
    }
    return csvResponse('비용_속보', rows)
  }

  if (type === 'sr-requests') {
    // SR 신청내역 — 화면과 동일 스코핑 (본인/부서/전사)
    const scope = s.srRequests.filter((r) =>
      role === 'USER' ? r.requester === session.name :
      role === 'DEPT_MGR' ? r.dept === session.dept : true)
    const rows: (string | number)[][] = [['SR번호', '유형', '제목', '시스템', '신청자', '부서', '상태', '공수(MD)', '신청일', '완료예정', '완료일']]
    for (const r of scope) rows.push([r.srNo, r.kind, r.title, r.system, r.requester, r.dept, r.status, r.manHours ?? '-', r.requestedAt, r.dueDate ?? '-', r.completedAt ?? '-'])
    return csvResponse('SR_신청내역', rows)
  }

  if (type === 'ci-srs') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['번호', '구분', '제목', '요청자', '접수자', '상태', '접수일', '완료일', '처리 내용']]
    for (const c of s.ciSrs) rows.push([c.id, c.category, c.title, c.requester, c.receivedBy, c.status, c.receivedAt, c.completedAt ?? '-', c.result ?? '-'])
    return csvResponse('CI_SR_처리이력', rows)
  }

  if (type === 'incidents') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['장애번호', '등급', '시스템', '제목', '발생일', '조치상태', '조치내역', '향후대책', '대책결과', '보고상태']]
    for (const i of s.incidents) rows.push([i.id, i.grade, i.system, i.title, i.occurredAt, i.status, i.action ?? '-', i.countermeasure ?? '-', i.cmResult ?? '-', i.reportStatus])
    return csvResponse('장애_관리대장', rows)
  }

  if (type === 'changes') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['변경번호', '구분', '제목', '매칭 SR', '상태', '등록일', '작업계획', '작업결과']]
    for (const c of s.changes) rows.push([c.id, c.kind, c.title, c.srNo ?? '-', c.status, c.registeredAt, c.plan ?? '-', c.result ?? '-'])
    return csvResponse('변경_관리대장', rows)
  }

  if (type === 'projects') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    // 참여 서약 — 화면과 동일하게 현 개정본 유효 서명만 인별 중복 제거·현재 명단 한정 (stale 과다계수 방지)
    const pjRevised = s.pledgeForms.find((f) => f.kind === '프로젝트')?.revisedAt ?? '0000-00-00'
    const rows: (string | number)[][] = [['번호', '프로젝트', 'PM', '투입 인력', '참여 서약', '시작', '종료', '진척(%)', '상태']]
    for (const p of s.projects) {
      const names = new Set(s.pledges.filter((x) => x.kind === '프로젝트' && x.projectRef === p.id && x.signedAt >= pjRevised).map((x) => x.name))
      const signs = p.members ? p.members.filter((m) => names.has(m)).length : names.size
      rows.push([p.id, p.title, p.manager, p.headcount, signs, p.start, p.end, p.progress, p.status])
    }
    return csvResponse('프로젝트_진행현황', rows)
  }

  if (type === 'project-issues') {
    // 프로젝트 이슈·리스크 대장 — PMO/운영위 보고 근거(제품안내서 III장). /projects/schedule(BIZ) 게이트.
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const projectOf = (id: string) => s.projects.find((p) => p.id === id)
    const rows: (string | number)[][] = [['번호', '프로젝트', '이슈 · 리스크', '리스크', '상태', '등록일']]
    for (const i of s.projectIssues) rows.push([i.id, projectOf(i.projectId)?.title ?? i.projectId, i.title, i.risk, i.status, i.raisedAt])
    return csvResponse('프로젝트_이슈리스크', rows)
  }

  if (type === 'deliverables') {
    // 프로젝트 산출물 대장 — 기한 경과 포함(제품안내서 III장 일정·산출물). /projects/schedule(BIZ) 게이트.
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const t = today()
    const projectOf = (id: string) => s.projects.find((p) => p.id === id)
    const rows: (string | number)[][] = [['번호', '프로젝트', '산출물', '기한', '상태']]
    for (const d of s.deliverables) rows.push([d.id, projectOf(d.projectId)?.title ?? d.projectId, d.name, d.due, d.done ? '완료' : (d.due < t ? '기한경과' : '미완')])
    return csvResponse('프로젝트_산출물', rows)
  }

  if (type === 'printouts') {
    // 출력물폐기현황 — 사용자 본인·부서담당 소속 부서만 (화면 동일 스코핑)
    const scope = s.printouts.filter((p) =>
      role === 'USER' ? p.name === session.name :
      role === 'DEPT_MGR' ? p.dept === session.dept : true)
    const rows: (string | number)[][] = [['번호', '출력일', '출력자', '부서', '문서', '개인정보', '폐기방법', '폐기일', '상태']]
    for (const p of scope) rows.push([p.id, p.printedAt, p.name, p.dept, p.document, p.personalInfo ? 'Y' : 'N', p.method ?? '-', p.discardedAt ?? '-', p.status])
    return csvResponse('출력물_폐기현황', rows)
  }

  if (type === 'violations') {
    // 보안위반 — 담당(BIZ)·Admin 만 전사, 그 외는 본인 건만 (화면 canManage 와 동일)
    const scope = s.violations.filter((v) => (isMgr ? true : v.name === session.name))
    const rows: (string | number)[][] = [['번호', '위반자', '부서', '유형', '내용', '발생일', '상태']]
    for (const v of scope) rows.push([v.id, v.name, v.dept, v.type, v.detail, v.occurredAt, v.status])
    return csvResponse('보안위반_관리대장', rows)
  }

  if (type === 'security-reviews') {
    // 보안성 검토 — 담당(BIZ)·Admin 전용 (화면 canManage/메뉴 권한과 동일 스코프)
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['번호', '유형', '제목', '대상', '검토자', '예정일', '완료일', '발견', '조치', '조치율(%)', '상태']]
    for (const r of s.securityReviews) {
      // 조치율 — 발견 0 건은 조치 대상 없음('해당없음'), 그 외 Math.round 거짓 100 방지 (이수현황 export 와 동일 원칙)
      const rate = r.findings > 0 ? (r.fixed >= r.findings ? 100 : Math.min(99, Math.round((r.fixed / r.findings) * 100))) : '해당없음'
      rows.push([r.id, r.kind, r.title, r.target, r.reviewer, r.plannedAt, r.completedAt ?? '', r.findings, r.fixed, rate, r.status])
    }
    return csvResponse('보안성검토_관리대장', rows)
  }

  if (type === 'compliance-summary') {
    // 보안 컴플라이언스 종합 현황 — ISMS 외부 감사 대응 근거(제품안내서 IV·VI장). 담당(BIZ)·Admin 전용.
    // 각 지표는 소속 화면과 동일 단일-원천 술어로 산출(비율은 div-zero·false-100 방어) — 화면과 수치 불일치 방지.
    if (!isMgr) return new Response('forbidden', { status: 403 })
    // KPI 는 lib/compliance 단일 원천(추세 스냅샷과 공유) — 화면·산출물 수치 불일치 방지.
    const k = computeComplianceKpis(s)
    const score = compliancePostureScore(k)
    const weak = weakestPostureAxis(k)
    const rows: (string | number)[][] = [
      ['지표', '값', '비고'],
      ['포스처 점수', `${score} / 100`, `등급 ${postureRating(score).label} · 5축(서약·이수·조치·점검·리스크) 균등`],
      ['개선 우선순위(최약 축)', `${weak.label} ${weak.pct}%`, weak.advice],
      ['일반 보안서약률', `${complianceKpiPct(k.signedCount, k.totalPeople)}%`, `${k.signedCount}/${k.totalPeople}명 (${currentYear()}년 현 개정본)`],
      ['보안교육 이수율', `${complianceKpiPct(k.eduDone, k.eduSlots)}%`, `완료 과정 ${k.doneCourses}건 · 대상 이수 ${k.eduDone}/${k.eduSlots}`],
      ['보안점검(ISMS)', `완료 ${k.inspDone} / 전체 ${k.inspTotal}`, `결과 미등록 ${k.inspPending}건`],
      ['보안성 검토 조치율', k.fixFindings > 0 ? `${complianceKpiPct(k.fixDone, k.fixFindings)}%` : '해당없음', `고위험 미조치 ${k.highVulns}건 · 미조치 취약점 ${k.openVulns}건 · 검토 ${k.reviewCount}건`],
      ['보안위반 처리', `완료 ${k.vDone} / 전체 ${k.vTotal}`, `확인서 징구중 ${k.vPending}건`],
    ]
    return csvResponse('보안컴플라이언스_종합현황', rows)
  }

  if (type === 'compliance-trend') {
    // 컴플라이언스 포스처 추세 — 주기별 스냅샷(ISMS 감사 개선 추이). /compliance/inspection(BIZ) 게이트.
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const snaps = [...s.complianceSnapshots].sort((a, b) => String(a.period ?? '').localeCompare(String(b.period ?? '')))
    const rows: (string | number)[][] = [['기간', '포스처 점수', '서약률(%)', '이수율(%)', '조치율(%)', '점검 완료', '점검 전체', '고위험 미조치', '미조치 취약점', '위반 완료', '위반 전체', '기록', '기록자']]
    for (const x of snaps) rows.push([x.period, x.score, x.pledgeRate, x.eduRate, x.fixRate, x.inspDone, x.inspTotal, x.highVulns, x.openVulns, x.vDone, x.vTotal, x.at, x.by])
    return csvResponse('보안컴플라이언스_추세', rows)
  }

  if (type === 'itops-summary') {
    // IT 운영 종합 현황 — 관리 리포트(SR·장애·프로젝트·투자/비용 집행). /sr/manage(BIZ) 게이트로 담당·Admin 전용.
    // 각 지표는 소속 화면과 동일 단일-원천 술어(집행률은 확정계획 스코프·div-zero 방어)로 산출 — 화면과 정합.
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const t = today()
    // 1) SR — 진행중·지연 (sr/delayed·대시보드와 동일 술어)
    const srActive = s.srRequests.filter((r) => !['완료', '반려'].includes(r.status)).length
    const srDelayed = s.srRequests.filter((r) => r.dueDate && r.dueDate < t && !['완료', '반려', '작성중', '결재중', '중지'].includes(r.status)).length
    // 2) 장애 — 조치중 (대시보드 ops 와 동일)
    const incActing = s.incidents.filter((i) => i.status === '조치중').length
    // 3) 프로젝트 — 진행중·평균 진척·오픈 이슈 (projects/status·schedule 와 동일)
    const pjActive = s.projects.filter((p) => p.status === '진행중')
    const pjAvg = pjActive.length ? Math.round(pjActive.reduce((sum, p) => sum + p.progress, 0) / pjActive.length) : 0
    const pjIssues = s.projectIssues.filter((i) => i.status === '오픈').length
    // 4) 투자·비용 집행률 — lib/finance 단일 원천(finance/invest·expense 화면과 동일 산식·스코프)
    const finKpis = (kind: '투자' | '비용') => {
      const contracts = s.investContracts.filter((c) => c.kind === kind)
      const settlements = s.settlements.filter((x) => contracts.some((c) => c.id === x.contractId))
      return computeFinanceKpis(s.investPlans.filter((p) => p.kind === kind), contracts, settlements)
    }
    const inv = finKpis('투자')
    const exp = finKpis('비용')
    // 5) 인프라 운영 헬스 — 배치 실패·인터페이스 오류·디스크 경고 (lib/infra 단일원천, 운영·시스템 화면·대시보드와 정합)
    const infra = computeInfraHealth(s)
    const rows: (string | number)[][] = [
      ['지표', '값', '비고'],
      ['진행중 SR', srActive, `지연 ${srDelayed}건 (완료예정일 경과)`],
      ['조치중 장애', incActing, `전체 장애 ${s.incidents.length}건`],
      ['인프라 운영', `배치 실패 ${infra.failedBatches} · IF 오류 ${infra.brokenIfs} · 디스크 경고 ${infra.diskWarns}`, `배치 ${infra.batchTotal} · 인터페이스 ${infra.ifTotal} · 서버 ${infra.serverTotal} (디스크 >${DISK_WARN}%)`],
      ['프로젝트', `진행중 ${pjActive.length}`, `평균 진척 ${pjAvg}% · 오픈 이슈 ${pjIssues}건`],
      ['투자 집행률', `${inv.execRate}%`, `확정계획 ${inv.planTotal.toLocaleString('ko-KR')}만원`],
      ['비용 집행률', `${exp.execRate}%`, `확정계획 ${exp.planTotal.toLocaleString('ko-KR')}만원`],
    ]
    return csvResponse('IT운영_종합현황', rows)
  }

  if (type === 'servers') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['서버번호', '호스트명', 'IP', '용도', 'OS', 'CPU', '메모리(GB)', '랙', 'H/W', '디스크(%)']]
    for (const v of s.servers) rows.push([v.id, v.hostname, v.ip, v.purpose, v.os, v.cpu ?? '-', v.memoryGb ?? '-', v.rack, v.hwId ?? '-', v.diskUsedPct])
    return csvResponse('서버_관리대장', rows)
  }

  if (type === 'systems') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['코드', '시스템', '구분', '접속 URL', '서버', '담당']]
    for (const x of s.systems) {
      rows.push([x.id, x.name, x.env, x.url, x.serverIds.map((id) => s.servers.find((v) => v.id === id)?.hostname ?? id).join(' · '), x.owner])
    }
    return csvResponse('시스템_관리대장', rows)
  }

  if (type === 'batches') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['잡번호', '이름', '대상 시스템', '주기', '최근 실행', '결과']]
    for (const b of s.batchJobs) rows.push([b.id, b.name, b.system, b.schedule, b.lastRun ?? '-', b.lastResult ?? '-'])
    return csvResponse('배치_관리대장', rows)
  }

  if (type === 'interfaces') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['번호', '인터페이스', 'From', 'To', '방식', '상태']]
    for (const i of s.interfaces) rows.push([i.id, i.name, i.from, i.to, i.method, i.status])
    return csvResponse('인터페이스_관리대장', rows)
  }

  if (type === 'racks') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['랙번호', '위치', '사이즈(U)', '자산번호', '장착 H/W', '논리 서버']]
    for (const r of s.racks) {
      rows.push([r.id, r.location, r.sizeU, r.assetNo,
        s.hardware.filter((h) => h.rackId === r.id).length, s.servers.filter((v) => v.rack === r.id).length])
    }
    return csvResponse('랙_관리대장', rows)
  }

  if (type === 'hardware') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['번호', '구분', '모델', '랙', '자산번호']]
    for (const h of s.hardware) rows.push([h.id, h.kind, h.model, h.rackId, h.assetNo])
    return csvResponse('HW_관리대장', rows)
  }

  if (type === 'inspection-plans') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['계획번호', '점검 항목', '예정월', '점검자', '상태', '점검 결과']]
    for (const p of s.inspectionPlans) {
      const item = s.inspectionItems.find((i) => i.id === p.itemId)
      rows.push([p.id, item?.control ?? p.itemId, p.month, p.inspector, p.status, p.result ?? '-'])
    }
    return csvResponse('보안점검_계획', rows)
  }

  if (type === 'inspection-items') {
    // 보안점검 기준(Template) 목록 (요구사항 62행 엑셀 ◎) — 화면과 동일 권한
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['코드', '대분류', '중분류', '통제 항목', '주기', '구분']]
    for (const i of s.inspectionItems) rows.push([i.id, i.category, i.subCategory ?? '-', i.control, i.cycle, i.source])
    return csvResponse('보안점검_기준', rows)
  }

  if (type === 'audit') {
    if (role !== 'ADMIN') return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['일시', '행위자', '행위', '상세']]
    for (const l of s.auditLogs) rows.push([l.at, l.actor, l.action, l.detail])
    return csvResponse('감사_이력', rows)
  }

  return new Response('unknown type', { status: 400 })
}
