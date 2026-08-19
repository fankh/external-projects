import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { daysBetween, today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { delayedSrs, isSrReplannable } from '@/lib/sr'
import { SR_CHIP, srStatusLabel } from '../chips'

async function replan(formData: FormData) {
  'use server'
  await requireMenuRole('/sr/delayed', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const dueDate = String(formData.get('dueDate') ?? '')
  // 재계획일은 형식 + 미래(오늘 이상)만 — 과거일로 지연 회피/오분류를 막는다(input min={t} 는 클라이언트 전용)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < today()) return
  const s = getStore()
  // 배정 후 진행중(dueDate 보유·비종결) SR 만 재계획 — 임의 POST 로 완료·반려·미배정(CI배정, dueDate 없음)
  // SR 의 dueDate 를 덮어써 지연목록·SR지연 알림에 오분류로 넣는 것을 차단(assignCi 의 CI배정 상태 가드와 정합).
  const sr = s.srRequests.find((r) => r.srNo === srNo && isSrReplannable(r))
  if (sr) sr.dueDate = dueDate
  revalidatePath('/', 'layout')
}

export default async function SrDelayedPage() {
  await requireMenu('/sr/delayed')
  const s = getStore()
  const t = today()

  // 결재완료(배정 이후) SR 중 완료 예정일을 넘긴 건 — lib/sr 단일 원천(대시보드·export·알림 배치 공유)
  const delayed = delayedSrs(s, t)

  return (
    <>
      <ScreenHeader kicker="IT Request" title="지연내역"
        desc={`완료 예정일(오늘 ${t} 기준)을 넘긴 진행중 SR — 사유 확인 후 완료일을 재계획한다.`} />

      <div className="stat-row">
        <Stat value={delayed.length} label="지연 건" tone={delayed.length > 0 ? 'err' : undefined} />
        <Stat value={delayed.length ? Math.max(0, ...delayed.map((r) => daysBetween(r.dueDate!, t) ?? 0)) : 0} label="최대 지연일수" tone={delayed.length ? 'warn' : undefined} />
      </div>

      <Card title="지연 SR" pad={false}>
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
                    <td><Chip tone={SR_CHIP[r.status]}>{srStatusLabel(r)}</Chip></td>
                    <td className="tnum">{r.dueDate}</td>
                    <td className="num"><Chip tone="err" bare>D+{daysBetween(r.dueDate!, t) ?? '-'}</Chip></td>
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
