import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'

const SR_CHIP: Record<string, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  작성중: 'neutral', 결재중: 'info', CI배정: 'info', 개발중: 'warn', 테스트: 'warn', 적용요청: 'warn', 완료: 'ok', 반려: 'err',
}

export default async function DashboardPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const period = today().slice(0, 7)

  const myTodos = s.todos.filter((t) => t.owner === me.name && !t.done)
  const myApprovals = s.approvals.filter((a) => a.approver === me.name && a.status === '대기')
  const mySr = s.srRequests.filter((r) => r.requester === me.name && r.status !== '완료' && r.status !== '반려')
  const pledgeTodo = myTodos.some((t) => t.kind === '보안서약서')
  const notices = [...s.notices].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))

  // 관리대상 현황 — 의식제고·컴플라이언스·계획수립 (요구사항 개인별현황 포틀릿)
  const remoteDone = s.remoteChecks.some((r) => r.name === me.name && r.period === period)
  const eduDone = s.educationCourses.filter((c) => c.status === '완료')
  const myEduMissing = eduDone.filter((c) => !s.educationRecords.some((r) => r.courseId === c.id && r.name === me.name)).length
  const myViolations = s.violations.filter((v) => v.name === me.name && v.status === '징구중').length
  const myPlansDraft = s.investPlans.filter((p) => p.owner === me.name && p.status === '작성중').length

  // 전사 운영 스냅샷 (업무담당·Admin)
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signedNames = new Set(s.pledges.filter((p) => p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
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
        <Stat value={pledgeTodo ? '미제출' : '완료'} label="보안서약서" tone={pledgeTodo ? 'err' : undefined} note="2026년 일반 서약" />
      </div>

      {/* 관리대상 현황 — 의식제고 · 컴플라이언스 · 계획수립 */}
      <div className="stat-row">
        <Stat value={remoteDone ? '제출' : '미제출'} label="재택 체크리스트" tone={remoteDone ? undefined : 'warn'} note={period} />
        <Stat value={myEduMissing} label="보안교육 미이수" tone={myEduMissing > 0 ? 'err' : undefined} note="완료 과정 기준" />
        <Stat value={myViolations} label="보안위반 확인서 대상" tone={myViolations > 0 ? 'err' : undefined} />
        <Stat value={myPlansDraft} label="계획수립 작성중" note="투자·비용 과제" />
      </div>

      {canManage && (
        <Card title="전사 운영 스냅샷" kicker="Operations" pad={false}>
          <div className="stat-row" style={{ border: 'none' }}>
            <Stat value={ops.incidents} label="조치중 장애" tone={ops.incidents > 0 ? 'err' : undefined} />
            <Stat value={ops.delayedSr} label="지연 SR" tone={ops.delayedSr > 0 ? 'warn' : undefined} />
            <Stat value={ops.openIssues} label="프로젝트 오픈 이슈" tone={ops.openIssues > 0 ? 'warn' : undefined} />
            <Stat value={ops.unsigned} label="미서약 인원" tone={ops.unsigned > 0 ? 'warn' : undefined} />
            <Stat value={ops.inspections} label="점검 미등록 · 경과" tone={ops.inspections > 0 ? 'warn' : undefined} />
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
                      <td><Chip tone={SR_CHIP[r.status]}>{r.status}</Chip></td>
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
