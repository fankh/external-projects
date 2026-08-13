import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

const RISK_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

async function addDeliverable(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/projects/schedule', 'BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const due = String(formData.get('due') ?? '')
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return
  const max = s.deliverables.reduce((m, d) => Math.max(m, Number(d.id.replace('DL-', '')) || 0), 0)
  const id = `DL-${String(max + 1).padStart(2, '0')}`
  s.deliverables.push({ id, projectId, name, due, done: false })
  // 산출물 파일 — 공통 첨부 (첨부 시트: 프로젝트 일정/산출물관리)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/projects/schedule')
}

async function toggleDeliverable(formData: FormData) {
  'use server'
  await requireMenuRole('/projects/schedule', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const d = s.deliverables.find((x) => x.id === String(formData.get('id') ?? ''))
  if (d) d.done = !d.done
  revalidatePath('/projects/schedule')
}

async function addIssue(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/projects/schedule', 'BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const risk = String(formData.get('risk') ?? '') as '높음' | '중간' | '낮음'
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !title || !['높음', '중간', '낮음'].includes(risk)) return
  const id = nextNo('PI', today().slice(0, 4), s.projectIssues.map((i) => i.id))
  s.projectIssues.unshift({ id, projectId, title, risk, status: '오픈', raisedAt: today() })
  // 이슈 근거 자료 — 공통 첨부 (첨부 시트: 프로젝트 이슈&리스트)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/', 'layout')
}

async function resolveIssue(formData: FormData) {
  'use server'
  await requireMenuRole('/projects/schedule', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const i = s.projectIssues.find((x) => x.id === String(formData.get('id') ?? '') && x.status === '오픈')
  if (i) i.status = '해결'
  revalidatePath('/', 'layout')
}

export default async function SchedulePage() {
  await requireMenu('/projects/schedule')
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
                    <td className="strong">{d.name}<Clip count={attachCount(d.id)} title="산출물 파일" /></td>
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
              <select aria-label="projectId" className="select" name="projectId">
                {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
              <input aria-label="산출물명" className="input" name="name" required maxLength={120} placeholder="산출물명" style={{ flex: 1 }} />
              <input aria-label="due" className="input" name="due" required type="date" />
              <input className="input" type="file" name="file" style={{ width: 140, paddingTop: 4 }} title="산출물 파일 첨부" />
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
                    <td className="strong">{i.title}<Clip count={attachCount(i.id)} title="이슈 근거 자료" /></td>
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
              <select aria-label="projectId" className="select" name="projectId">
                {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
              <input aria-label="이슈 · 리스크 내용" className="input" name="title" required maxLength={120} placeholder="이슈 · 리스크 내용" style={{ flex: 1 }} />
              <select aria-label="risk" className="select" name="risk">
                <option>높음</option><option>중간</option><option>낮음</option>
              </select>
              <input className="input" type="file" name="file" style={{ width: 140, paddingTop: 4 }} title="근거 자료 첨부" />
              <button type="submit" className="btn">등록</button>
            </form>
          </div>
        </Card>
      </div>
    </>
  )
}
