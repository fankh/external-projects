import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { SR_CHIP } from '../chips'

export default async function SrRequestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const { q } = await searchParams
  const s = getStore()

  // 데이터 스코핑 — 사용자: 본인 / 부서담당: 부서 / 업무담당·Admin: 전사
  const scoped = s.srRequests.filter((r) =>
    me.role === 'USER' ? r.requester === me.name :
    me.role === 'DEPT_MGR' ? r.dept === me.dept : true,
  )
  const query = (q ?? '').trim()
  const rows = query
    ? scoped.filter((r) => r.srNo.includes(query) || r.title.includes(query) || r.system.includes(query))
    : scoped
  const inflight = scoped.filter((r) => r.status !== '완료' && r.status !== '반려')

  const scopeLabel = me.role === 'USER' ? '본인 신청 건' : me.role === 'DEPT_MGR' ? `${me.dept} 신청 건` : '전사 신청 건'

  return (
    <>
      <ScreenHeader kicker="IT Request" title="신청내역"
        desc={`${scopeLabel}의 SR 진행 상태를 추적한다.`}
        right={<Link className="btn pri" href="/sr/new">SR 신청</Link>} />

      <div className="stat-row">
        <Stat value={scoped.length} label="전체" />
        <Stat value={inflight.length} label="진행중" note="완료 · 반려 제외" />
        <Stat value={scoped.filter((r) => r.status === '결재중').length} label="결재중" />
        <Stat value={scoped.filter((r) => r.status === '완료').length} label="완료" />
      </div>

      <Card title="신청 목록" kicker="Requests"
        actions={query ? <Chip tone="info" bare>검색: {query}</Chip> : undefined} pad={false}>
        {rows.length === 0 ? (
          <div className="empty">{query ? '검색 결과가 없습니다.' : '신청한 SR이 없습니다.'}</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>SR번호</th><th>유형</th><th>제목</th><th>시스템</th><th>신청자</th><th>상태</th><th>담당 CI</th><th>요청일</th><th>완료 예정</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="strong">{r.title}</td>
                    <td>{r.system}</td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td><Chip tone={SR_CHIP[r.status]}>{r.status}</Chip></td>
                    <td>{r.ci ?? <span className="mut">미배정</span>}</td>
                    <td className="tnum">{r.requestedAt}</td>
                    <td className="tnum">{r.dueDate ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
