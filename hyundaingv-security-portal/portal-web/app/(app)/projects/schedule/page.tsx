import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

const RISK_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

async function addDeliverable(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const due = String(formData.get('due') ?? '')
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return
  const max = s.deliverables.reduce((m, d) => Math.max(m, Number(d.id.replace('DL-', '')) || 0), 0)
  s.deliverables.push({ id: `DL-${String(max + 1).padStart(2, '0')}`, projectId, name, due, done: false })
  revalidatePath('/projects/schedule')
}

async function toggleDeliverable(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const d = s.deliverables.find((x) => x.id === String(formData.get('id') ?? ''))
  if (d) d.done = !d.done
  revalidatePath('/projects/schedule')
}

async function addIssue(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const risk = String(formData.get('risk') ?? '') as '높음' | '중간' | '낮음'
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !title || !['높음', '중간', '낮음'].includes(risk)) return
  s.projectIssues.unshift({
    id: nextNo('PI', today().slice(0, 4), s.projectIssues.map((i) => i.id)),
    projectId, title, risk, status: '오픈', raisedAt: today(),
  })
  revalidatePath('/', 'layout')
}

async function resolveIssue(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const i = s.projectIssues.find((x) => x.id === String(formData.get('id') ?? '') && x.status === '오픈')
  if (i) i.status = '해결'
  revalidatePath('/', 'layout')
}

export default async function SchedulePage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const t = today()
  const projectOf = (id: string) => s.projects.find((p) => p.id === id)

  const doneCount = s.deliverables.filter((d) => d.done).length
  const lateDl = s.deliverables.filter((d) => !d.done && d.due < t)
  const openIssues = s.projectIssues.filter((i) => i.status === '오픈')

  return (
    <>
      <ScreenHeader kicker="프로젝트" title="일정 · 산출물 · 이슈"
        desc="계획 일정 대비 산출물 등록·점검과 이슈·리스크를 추적한다." />

      <div className="stat-row">
        <Stat value={`${doneCount} / ${s.deliverables.length}`} label="산출물 완료" />
        <Stat value={lateDl.length} label="산출물 기한 경과" tone={lateDl.length > 0 ? 'err' : undefined} note={`오늘 ${t}`} />
        <Stat value={openIssues.length} label="오픈 이슈" tone={openIssues.length > 0 ? 'warn' : undefined} />
        <Stat value={openIssues.filter((i) => i.risk === '높음').length} label="높은 리스크" tone={openIssues.some((i) => i.risk === '높음') ? 'err' : undefined} />
      </div>

      <div className="cols c2">
        <Card title="산출물 점검" kicker="Deliverables" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>프로젝트</th><th>산출물</th><th>기한</th><th>상태</th><th className="c">점검</th></tr></thead>
              <tbody>
                {s.deliverables.map((d) => (
                  <tr key={d.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{projectOf(d.projectId)?.id}</td>
                    <td className="strong">{d.name}</td>
                    <td className="tnum">{d.due} {!d.done && d.due < t && <Chip tone="err" bare>경과</Chip>}</td>
                    <td>{d.done ? <Chip tone="ok" bare>완료</Chip> : <Chip tone="neutral" bare>미완</Chip>}</td>
                    <td className="c">
                      <form action={toggleDeliverable} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={d.id} />
                        <button type="submit" className="btn sm">{d.done ? '완료 취소' : '완료 처리'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addDeliverable} className="hstack">
              <select className="select" name="projectId">
                {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
              <input className="input" name="name" required maxLength={120} placeholder="산출물명" style={{ flex: 1 }} />
              <input className="input" name="due" required type="date" />
              <button type="submit" className="btn">등록</button>
            </form>
          </div>
        </Card>

        <Card title="이슈 · 리스크" kicker="Issues" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>프로젝트</th><th>이슈</th><th>리스크</th><th>등록일</th><th>상태</th><th className="c">처리</th></tr></thead>
              <tbody>
                {s.projectIssues.map((i) => (
                  <tr key={i.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{projectOf(i.projectId)?.id}</td>
                    <td className="strong">{i.title}</td>
                    <td><Chip tone={RISK_TONE[i.risk]} bare>{i.risk}</Chip></td>
                    <td className="tnum">{i.raisedAt}</td>
                    <td>{i.status === '해결' ? <Chip tone="ok" bare>해결</Chip> : <Chip tone="warn" bare>오픈</Chip>}</td>
                    <td className="c">
                      {i.status === '오픈' ? (
                        <form action={resolveIssue} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={i.id} />
                          <button type="submit" className="btn sm">해결 처리</button>
                        </form>
                      ) : <span className="mut">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addIssue} className="hstack">
              <select className="select" name="projectId">
                {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
              <input className="input" name="title" required maxLength={120} placeholder="이슈 · 리스크 내용" style={{ flex: 1 }} />
              <select className="select" name="risk">
                <option>높음</option><option>중간</option><option>낮음</option>
              </select>
              <button type="submit" className="btn">등록</button>
            </form>
          </div>
        </Card>
      </div>
    </>
  )
}
