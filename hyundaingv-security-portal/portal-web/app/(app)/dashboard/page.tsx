import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { effectiveRoles, requireMenu } from '@/lib/authz'
import { currentYear, today } from '@/lib/dates'
import { eligibleForCourse, getStore, isRemoteTargetIn } from '@/lib/store'
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
  const notices = [...s.notices].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))

  // 관리대상 현황 — 의식제고·컴플라이언스·계획수립 (요구사항 개인별현황 포틀릿)
  const remoteDone = s.remoteChecks.some((r) => r.name === me.name && r.period === period)
  const remoteTarget = s.remoteTargets.some((t) => t.name === me.name && isRemoteTargetIn(t, period))
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
  const ops = {
    incidents: s.incidents.filter((i) => i.status === '조치중').length,
    delayedSr: s.srRequests.filter((r) => r.dueDate && r.dueDate < today() && !['완료', '반려', '작성중', '결재중'].includes(r.status)).length,
    openIssues: s.projectIssues.filter((i) => i.status === '오픈').length,
    unsigned: s.people.filter((p) => !signedNames.has(p.name)).length,
    inspections: s.inspectionPlans.filter((p) => p.status === '결과미등록' || (p.month < period && p.status === '계획')).length,
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
        <Card title="전사 운영 스냅샷" kicker="Operations" pad={false}>
          <div className="stat-row" style={{ border: 'none' }}>
            {opsVis.incidents && <Stat value={ops.incidents} label="조치중 장애" tone={ops.incidents > 0 ? 'err' : undefined} />}
            {opsVis.delayedSr && <Stat value={ops.delayedSr} label="지연 SR" tone={ops.delayedSr > 0 ? 'warn' : undefined} />}
            {opsVis.openIssues && <Stat value={ops.openIssues} label="프로젝트 오픈 이슈" tone={ops.openIssues > 0 ? 'warn' : undefined} />}
            {opsVis.unsigned && <Stat value={ops.unsigned} label="미서약 인원" tone={ops.unsigned > 0 ? 'warn' : undefined} />}
            {opsVis.inspections && <Stat value={ops.inspections} label="점검 미등록 · 경과" tone={ops.inspections > 0 ? 'warn' : undefined} />}
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
                    <td><Chip tone={n.category === '보안' ? 'err' : n.category === '시스템' ? 'info' : 'neutral'} bare>{n.category}</Chip></td>
                    <td className={n.pinned ? 'strong' : ''}>{n.pinned ? '📌 ' : ''}{n.title}</td>
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
