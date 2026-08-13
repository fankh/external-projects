import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { SR_CHIP } from '../chips'

async function replan(formData: FormData) {
  'use server'
  await requireMenuRole('/sr/delayed', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const dueDate = String(formData.get('dueDate') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo)
  if (sr) sr.dueDate = dueDate
  revalidatePath('/', 'layout')
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

export default async function SrDelayedPage() {
  await requireMenu('/sr/delayed')
  const s = getStore()
  const t = today()

  // 결재완료(배정 이후) SR 중 완료 예정일을 넘긴 건
  const delayed = s.srRequests.filter((r) =>
    r.dueDate && r.dueDate < t && !['완료', '반려', '작성중', '결재중'].includes(r.status),
  )

  return (
    <>
      <ScreenHeader kicker="IT Request" title="지연내역"
        desc={`완료 예정일(오늘 ${t} 기준)을 넘긴 진행중 SR — 사유 확인 후 완료일을 재계획한다.`} />

      <div className="stat-row">
        <Stat value={delayed.length} label="지연 건" tone={delayed.length > 0 ? 'err' : undefined} />
        <Stat value={delayed.length ? Math.max(...delayed.map((r) => daysBetween(r.dueDate!, t))) : 0} label="최대 지연일수" tone={delayed.length ? 'warn' : undefined} />
      </div>

      <Card title="지연 SR" kicker="Delayed" pad={false}>
        {delayed.length === 0 ? (
          <div className="empty">지연 중인 SR이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>SR번호</th><th>제목</th><th>담당 CI</th><th>상태</th><th>완료 예정</th><th className="num">지연</th><th className="c">재계획</th></tr>
              </thead>
              <tbody>
                {delayed.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td className="strong">{r.title}</td>
                    <td>{r.ci ?? '-'}</td>
                    <td><Chip tone={SR_CHIP[r.status]}>{r.status}</Chip></td>
                    <td className="tnum">{r.dueDate}</td>
                    <td className="num"><Chip tone="err" bare>D+{daysBetween(r.dueDate!, t)}</Chip></td>
                    <td className="c">
                      <form action={replan} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                        <input type="hidden" name="srNo" value={r.srNo} />
                        <input aria-label="지급 예정일" className="input" type="date" name="dueDate" required min={t} style={{ height: 25, fontSize: 11.5 }} />
                        <button type="submit" className="btn sm">완료일 변경</button>
                      </form>
                    </td>
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
