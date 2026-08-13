import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount } from '@/lib/attachments'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { SR_CHIP, srStatusLabel } from '../chips'

/** 반려·회수 SR 재상신 — 기안자 본인만. 반려는 사유 보완 전제의 '[재상신]', 회수(작성중)는 처음 상신과 동일하게. */
async function resubmitSr(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.requester === me.name && (r.status === '반려' || r.status === '작성중'))
  if (!sr || s.approvals.some((a) => a.ref === srNo && a.status === '대기')) return

  const rejected = sr.status === '반려'
  sr.status = '결재중'
  // '재상신' 할일 마감은 draftApproval 이 참조 번호로 공통 처리한다
  draftApproval({ docType: 'SR 신청', title: rejected ? `[재상신] ${sr.title}` : sr.title, ref: srNo, drafter: me })
  revalidatePath('/', 'layout')
}

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
                    <td className="strong">{r.title}<Clip count={attachCount(r.srNo)} title="본문 첨부" /></td>
                    <td>{r.system}</td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td>
                      <Chip tone={SR_CHIP[r.status]}>{srStatusLabel(r)}</Chip>
                      {(r.status === '반려' || r.status === '작성중') && r.requester === me.name && (
                        <form action={resubmitSr} style={{ display: 'inline', marginLeft: 6 }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <button type="submit" className="btn sm">{r.status === '반려' ? '재상신' : '상신'}</button>
                        </form>
                      )}
                    </td>
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
