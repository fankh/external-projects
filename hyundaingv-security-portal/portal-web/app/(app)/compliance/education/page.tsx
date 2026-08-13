import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'
import type { EducationCourse } from '@/lib/types'

const TARGETS: EducationCourse['target'][] = ['전임직원', '개발자', '보안담당자']

async function addCourse(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const target = String(formData.get('target') ?? '') as EducationCourse['target']
  const plannedMonth = String(formData.get('plannedMonth') ?? '')
  if (!title || !TARGETS.includes(target) || !/^\d{4}-\d{2}$/.test(plannedMonth)) return
  const s = getStore()
  const year = today().slice(0, 4)
  const id = nextNo('ED', year, s.educationCourses.map((c) => c.id))
  s.educationCourses.unshift({ id, year, title, target, plannedMonth, status: '계획' })
  // 결재완료된 연간계획 문서 업로드 — 과정번호(pk)로 계획·결과 첨부를 공유 (첨부 시트: 교육연간계획·개별계획)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/compliance/education')
}

async function registerAttendees(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const courseId = String(formData.get('courseId') ?? '')
  const names = formData.getAll('names').map(String)
  const s = getStore()
  const course = s.educationCourses.find((c) => c.id === courseId)
  if (!course || names.length === 0) return
  // 교육 결과·명단 증빙 — 같은 과정번호(pk)에 합산 (첨부 시트: 교육결과관리)
  registerUpload(courseId, formData.get('file'), me.name)

  for (const name of names) {
    const person = s.people.find((p) => p.name === name)
    if (!person || s.educationRecords.some((r) => r.courseId === courseId && r.name === name)) continue
    s.educationRecords.push({ courseId, name: person.name, dept: person.dept, completedAt: today() })

    // 폐쇄 루프 — 명단 등록이 해당 인원의 '보안교육' 할일을 닫는다 (대시보드·나의 할일 갱신)
    const todo = s.todos.find((t) => t.owner === name && t.kind === '보안교육' && !t.done)
    if (todo) todo.done = true
  }
  // 유효 이수자가 한 명도 없는 과정은 완료로 확정하지 않는다 — 빈 완료 과정은 이수율 집계를 왜곡한다
  if (s.educationRecords.some((r) => r.courseId === courseId)) course.status = '완료'
  revalidatePath('/', 'layout')
}

export default async function EducationPage() {
  const me = await requireMenu('/compliance/education')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'

  const done = s.educationCourses.filter((c) => c.status === '완료')
  const recordsOf = (courseId: string) => s.educationRecords.filter((r) => r.courseId === courseId)
  const completedBy = (name: string) => done.filter((c) => recordsOf(c.id).some((r) => r.name === name)).length
  const myMissing = done.filter((c) => !recordsOf(c.id).some((r) => r.name === me.name))
  const totalSlots = done.length * s.people.length
  const totalDone = done.reduce((sum, c) => sum + recordsOf(c.id).length, 0)

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="보안교육"
        desc="연간계획 → 과정별 결과·명단 등록 → 이수현황 집계 — 명단 등록이 대상자의 '보안교육' 할일을 닫는다." />

      <div className="stat-row">
        <Stat value={s.educationCourses.length} label="연간 과정" note={`완료 ${done.length}건`} />
        <Stat value={`${totalSlots ? Math.round((totalDone / totalSlots) * 100) : 0}%`} label="전사 이수율" note="완료 과정 기준" />
        <Stat value={myMissing.length} label="내 미이수" tone={myMissing.length > 0 ? 'err' : undefined} />
      </div>

      <Card title="연간계획 — 교육 과정" kicker="Annual Plan" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>과정번호</th><th>과정명</th><th>대상</th><th>예정월</th><th>상태</th><th className="num">이수 인원</th></tr></thead>
            <tbody>
              {s.educationCourses.map((c) => (
                <tr key={c.id}>
                  <td className="code">{c.id}</td>
                  <td className="strong">{c.title}<Clip count={attachCount(c.id)} title="계획·결과 문서" /></td>
                  <td><Chip tone="neutral" bare>{c.target}</Chip></td>
                  <td className="tnum">{c.plannedMonth}</td>
                  <td>{c.status === '완료' ? <Chip tone="ok">완료</Chip> : <Chip tone="neutral">계획</Chip>}</td>
                  <td className="num">{recordsOf(c.id).length} / {s.people.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && (
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addCourse} className="hstack">
              <input className="input" name="title" required maxLength={120} placeholder="교육 과정명" style={{ flex: 1 }} />
              <select className="select" name="target">
                {TARGETS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input className="input" name="plannedMonth" required type="month" defaultValue={today().slice(0, 7)} />
              <input className="input" type="file" name="file" style={{ width: 160, paddingTop: 4 }} title="결재완료 연간계획 문서 첨부" />
              <button type="submit" className="btn">과정 등록</button>
            </form>
          </div>
        )}
      </Card>

      <div className="cols c2">
        {canManage ? (
          <Card title="결과 · 명단 등록" kicker="Records">
            {s.educationCourses.map((c) => {
              const missing = s.people.filter((p) => !recordsOf(c.id).some((r) => r.name === p.name))
              if (missing.length === 0) return null
              return (
                <form key={c.id} action={registerAttendees} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                  <input type="hidden" name="courseId" value={c.id} />
                  <div className="hstack" style={{ marginBottom: 6 }}>
                    <span className="mono dim">{c.id}</span>
                    <span className="strong">{c.title}</span>
                    <span className="mut">미이수 {missing.length}명</span>
                  </div>
                  <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
                    {missing.map((p) => (
                      <label key={p.name} className="hstack" style={{ gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" name="names" value={p.name} /> {p.name}
                      </label>
                    ))}
                    <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 140, paddingTop: 2 }} title="결과·명단 증빙 첨부" />
                    <button type="submit" className="btn sm pri right">명단 등록</button>
                  </div>
                </form>
              )
            })}
            <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
              결과 등록 시 과정이 완료로 바뀌고, 등록된 인원의 '보안교육' 할일이 자동으로 닫힌다.
            </div>
          </Card>
        ) : (
          <Card title="내 이수현황" kicker="My Records" pad={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>과정</th><th>대상</th><th>상태</th><th>이수일</th></tr></thead>
                <tbody>
                  {s.educationCourses.map((c) => {
                    const rec = recordsOf(c.id).find((r) => r.name === me.name)
                    return (
                      <tr key={c.id}>
                        <td className="strong">{c.title}</td>
                        <td><Chip tone="neutral" bare>{c.target}</Chip></td>
                        <td>
                          {rec ? <Chip tone="ok">이수</Chip> :
                           c.status === '완료' ? <Chip tone="err">미이수</Chip> : <Chip tone="neutral">예정</Chip>}
                        </td>
                        <td className="tnum">{rec?.completedAt ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title={canManage ? '이수현황 — 전 임직원' : '이수율 안내'} kicker="Completion" pad={false}
          actions={canManage ? <a className="btn sm" href="/api/export?type=education-records">엑셀 다운로드</a> : undefined}>
          {canManage ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>이름</th><th>부서</th><th className="num">이수 / 완료 과정</th><th>상태</th></tr></thead>
                <tbody>
                  {s.people.map((p) => {
                    const n = completedBy(p.name)
                    return (
                      <tr key={p.name}>
                        <td className="strong">{p.name}</td>
                        <td>{p.dept}</td>
                        <td className="num">{n} / {done.length}</td>
                        <td>{n >= done.length ? <Chip tone="ok" bare>완료</Chip> : <Chip tone="err" bare>미이수</Chip>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              {myMissing.length === 0
                ? '완료된 과정을 모두 이수했습니다.'
                : `미이수 과정 ${myMissing.length}건 — 교육 이수 후 담당자가 명단을 등록하면 반영됩니다.`}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
