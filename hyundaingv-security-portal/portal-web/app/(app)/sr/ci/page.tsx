import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { ACCOUNTS } from '@/lib/session'
import { getStore } from '@/lib/store'
import { SR_CHIP } from '../chips'

async function assignCi(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const ci = String(formData.get('ci') ?? '').trim().slice(0, 40)
  const dueDate = String(formData.get('dueDate') ?? '')
  if (!ci || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return

  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === 'CI배정')
  if (!sr) return
  sr.ci = ci
  sr.dueDate = dueDate
  sr.status = '개발중'

  // 폐쇄 루프 — 'SR 처리' 할일이 배정과 함께 닫힌다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === 'SR 처리' && t.title.includes(srNo) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

async function baReject(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === 'CI배정')
  if (sr) sr.status = '반려'
  revalidatePath('/', 'layout')
}

export default async function SrCiPage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()

  const waiting = s.srRequests.filter((r) => r.status === 'CI배정')
  const assigned = s.srRequests.filter((r) => r.ci && r.status !== 'CI배정' && r.status !== '반려')
  const ciCandidates = ACCOUNTS.filter((a) => a.role === 'BIZ_MGR' || a.role === 'ADMIN')

  return (
    <>
      <ScreenHeader kicker="IT Request" title="CI SR 관리"
        desc="결재 완료 SR을 BA 검토 후 담당 CI에 배정한다 — 배정과 함께 'SR 처리' 할일이 닫힌다." />

      <div className="stat-row">
        <Stat value={waiting.length} label="배정 대기" tone={waiting.length > 0 ? 'warn' : undefined} note="결재 완료 건" />
        <Stat value={assigned.length} label="배정 완료" />
      </div>

      <Card title="배정 대기 — BA 검토" kicker="Assign" pad={false}>
        {waiting.length === 0 ? (
          <div className="empty">배정 대기 중인 SR이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>SR번호</th><th>유형</th><th>제목</th><th>신청자</th><th>담당 CI</th><th>완료 예정</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {waiting.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="strong">{r.title}</td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td colSpan={3}>
                      <form action={assignCi} className="hstack" style={{ padding: '3px 0' }}>
                        <input type="hidden" name="srNo" value={r.srNo} />
                        <select className="select" name="ci" required style={{ height: 25, fontSize: 11.5 }}>
                          {ciCandidates.map((c) => <option key={c.login} value={c.name}>{c.name} ({c.dept})</option>)}
                        </select>
                        <input className="input" type="date" name="dueDate" required defaultValue={today()} style={{ height: 25, fontSize: 11.5 }} />
                        <button type="submit" className="btn sm pri">배정 · 착수</button>
                        <button type="submit" className="btn sm danger" formAction={baReject}>BA 반려</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="배정 완료 — 진행중" kicker="Assigned" pad={false}>
        {assigned.length === 0 ? (
          <div className="empty">배정된 SR이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SR번호</th><th>제목</th><th>담당 CI</th><th>상태</th><th>완료 예정</th></tr></thead>
              <tbody>
                {assigned.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td className="strong">{r.title}</td>
                    <td>{r.ci}</td>
                    <td><Chip tone={SR_CHIP[r.status]}>{r.status}</Chip></td>
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
