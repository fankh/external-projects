import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

const SR_CHIP: Record<string, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  작성중: 'neutral', 결재중: 'info', CI배정: 'info', 개발중: 'warn', 테스트: 'warn', 적용요청: 'warn', 완료: 'ok', 반려: 'err',
}

export default async function DashboardPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()

  const myTodos = s.todos.filter((t) => t.owner === me.name && !t.done)
  const myApprovals = s.approvals.filter((a) => a.approver === me.name && a.status === '대기')
  const mySr = s.srRequests.filter((r) => r.requester === me.name && r.status !== '완료' && r.status !== '반려')
  const pledgeTodo = myTodos.some((t) => t.kind === '보안서약서')
  const notices = [...s.notices].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))

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
