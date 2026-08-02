import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { ApprovalStatus } from '@/lib/types'
import { approve, reject } from './actions'

const ST_CHIP: Record<ApprovalStatus, 'warn' | 'ok' | 'err'> = { 대기: 'warn', 승인: 'ok', 반려: 'err' }

export default async function ApprovalsPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()

  const inbox = s.approvals.filter((a) => a.approver === me.name)
  const inboxWaiting = inbox.filter((a) => a.status === '대기')
  const outbox = s.approvals.filter((a) => a.drafter === me.name)

  return (
    <>
      <ScreenHeader kicker="My Work" title="결재함"
        desc="수신함의 대기 건을 승인·반려하고, 상신함에서 내 기안 문서의 결재 상태를 추적한다." />

      <div className="stat-row">
        <Stat value={inboxWaiting.length} label="수신 대기" tone={inboxWaiting.length > 0 ? 'err' : undefined} note="내가 결재자" />
        <Stat value={outbox.filter((a) => a.status === '대기').length} label="상신 진행중" note="결재 대기" />
        <Stat value={outbox.filter((a) => a.status === '승인').length} label="상신 승인" />
        <Stat value={outbox.filter((a) => a.status === '반려').length} label="상신 반려" />
      </div>

      <Card title="수신함 — 결재 대기" kicker="Inbox" pad={false}>
        {inboxWaiting.length === 0 ? (
          <div className="empty">대기 중인 결재가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>결재번호</th><th>문서</th><th>제목</th><th>기안자</th><th>상신일</th><th className="c">처리</th></tr></thead>
              <tbody>
                {inboxWaiting.map((a) => (
                  <tr key={a.id}>
                    <td className="code">{a.id}</td>
                    <td><Chip tone="info" bare>{a.docType}</Chip></td>
                    <td className="strong">{a.title}{a.ref && <span className="mut"> · {a.ref}</span>}</td>
                    <td>{a.drafter} <span className="mut">· {a.dept}</span></td>
                    <td className="tnum">{a.draftedAt}</td>
                    <td className="c">
                      <span className="hstack" style={{ justifyContent: 'center' }}>
                        <form action={approve}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="btn sm pri">승인</button>
                        </form>
                        <form action={reject}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="btn sm danger">반려</button>
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="cols c2">
        <Card title="수신함 — 처리 완료" kicker="Inbox" pad={false}>
          {inbox.filter((a) => a.status !== '대기').length === 0 ? (
            <div className="empty">처리한 결재가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>문서</th><th>제목</th><th>상태</th><th>처리일</th></tr></thead>
                <tbody>
                  {inbox.filter((a) => a.status !== '대기').map((a) => (
                    <tr key={a.id}>
                      <td><Chip tone="neutral" bare>{a.docType}</Chip></td>
                      <td>{a.title}</td>
                      <td><Chip tone={ST_CHIP[a.status]}>{a.status}</Chip></td>
                      <td className="tnum">{a.decidedAt ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="상신함 — 내 기안 문서" kicker="Outbox" pad={false}>
          {outbox.length === 0 ? (
            <div className="empty">상신한 문서가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>문서</th><th>제목</th><th>결재자</th><th>상태</th><th>상신일</th></tr></thead>
                <tbody>
                  {outbox.map((a) => (
                    <tr key={a.id}>
                      <td><Chip tone="neutral" bare>{a.docType}</Chip></td>
                      <td className="strong">{a.title}</td>
                      <td>{a.approver}</td>
                      <td><Chip tone={ST_CHIP[a.status]}>{a.status}</Chip></td>
                      <td className="tnum">{a.draftedAt}</td>
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
