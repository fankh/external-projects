import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { eligibleForCourse, getStore, nextNo } from '@/lib/store'
import type { EducationCourse } from '@/lib/types'

const TARGETS: EducationCourse['target'][] = ['전임직원', '개발자', '보안담당자']

async function addCourse(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/education', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const target = String(formData.get('target') ?? '') as EducationCourse['target']
  const plannedMonth = String(formData.get('plannedMonth') ?? '')
  // 예정월은 달력상 유효월(01~12)만 — 2026-13·2026-00 등 무효월 저장 차단 (addPlan 과 동일 정합)
  if (!title || !TARGETS.includes(target) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(plannedMonth)) return
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
  const me = await requireMenuRole('/compliance/education', 'BIZ_MGR', 'ADMIN')
  const courseId = String(formData.get('courseId') ?? '')
  const names = formData.getAll('names').map(String)
  const s = getStore()
  const course = s.educationCourses.find((c) => c.id === courseId)
  if (!course || names.length === 0) return
  // 교육 결과·명단 증빙 — 같은 과정번호(pk)에 합산 (첨부 시트: 교육결과관리)
  registerUpload(courseId, formData.get('file'), me.name)

  const eligibleNames = new Set(eligibleForCourse(s, course.target).map((p) => p.name))
  for (const name of names) {
    const person = s.people.find((p) => p.name === name)
    // 과정 대상 스코프 밖 인원은 이수 기록 대상이 아니다 — 화면은 대상자만 체크박스로 노출하나 서버액션은
    // 임의 POST 가능하므로 재검증한다(비대상 기록이 들어가면 완료 확정·이수율이 왜곡된다, v1.5.51 단일 원천).
    if (!person || !eligibleNames.has(name) || s.educationRecords.some((r) => r.courseId === courseId && r.name === name)) continue
    s.educationRecords.push({ courseId, name: person.name, dept: person.dept, completedAt: today() })

    // 폐쇄 루프 — 명단 등록이 '해당 과정의' 보안교육 할일을 닫는다. 유형만으로 닫으면 다른 과정을
    // 이수해도 무관한 과정의 교육 의무 할일이 닫혀 실제 미이수가 대시보드에서 숨는다(할일-이수 괴리).
    // 할일 제목이 과정명을 포함하므로 과정명으로 좁혀 그 과정 할일만 닫는다.
    const todo = s.todos.find((t) => t.owner === name && t.kind === '보안교육' && !t.done && t.title.includes(course.title))
    if (todo) todo.done = true
  }
  // 유효(대상) 이수자가 한 명도 없는 과정은 완료로 확정하지 않는다 — 대상 밖 기록만으론 완료가 되지 않게
  // 대상 스코프 이수자 존재를 확인한다(빈/왜곡 완료 과정이 이수율 집계를 흔드는 것을 방지).
  if (eligibleNames.size > 0 && s.educationRecords.some((r) => r.courseId === courseId && eligibleNames.has(r.name))) course.status = '완료'
  revalidatePath('/', 'layout')
}

export default async function EducationPage() {
  const me = await requireMenu('/compliance/education')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'

  const done = s.educationCourses.filter((c) => c.status === '완료')
  const recordsOf = (courseId: string) => s.educationRecords.filter((r) => r.courseId === courseId)
  // 과정 대상(전임직원/개발자/보안담당자)을 반영한 이수 의무자만 분모로 잡는다 — 비대상자를 미이수로
  // 오표기하고 전사 이수율을 낮게 왜곡하던 결함(대상 무시) 방지. 재직자 스코프(v1.5.24)는 eligibleForCourse
  // 가 s.people 기준이라 그대로 유지된다.
  const eligible = (target: string | undefined) => eligibleForCourse(s, target)
  const eligibleDone = (name: string) => done.filter((c) => eligible(c.target).some((p) => p.name === name))
  const completedBy = (name: string) => eligibleDone(name).filter((c) => recordsOf(c.id).some((r) => r.name === name)).length
  const myMissing = eligibleDone(me.name).filter((c) => !recordsOf(c.id).some((r) => r.name === me.name))
  const totalSlots = done.reduce((sum, c) => sum + eligible(c.target).length, 0)
  const totalDone = done.reduce((sum, c) => sum + eligible(c.target).filter((p) => recordsOf(c.id).some((r) => r.name === p.name)).length, 0)

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="보안교육"
        desc="연간계획 → 과정별 결과·명단 등록 → 이수현황 집계 — 명단 등록이 대상자의 '보안교육' 할일을 닫는다." />

      <div className="stat-row">
        <Stat value={s.educationCourses.length} label="연간 과정" note={`완료 ${done.length}건`} />
        {/* 100% 는 전원 이수일 때만 — Math.round 는 99.5% 를 100 으로 올려 미이수자가 남은 컴플라이언스
            지표를 거짓 완주로 보이게 한다(governance 오신호). 완주가 아니면 99 로 캡, 완주면 100. */}
        <Stat value={`${totalSlots ? (totalDone >= totalSlots ? 100 : Math.min(99, Math.round((totalDone / totalSlots) * 100))) : 0}%`} label="전사 이수율" note="완료 과정 기준" />
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
                  {/* 이수 인원 / 대상 — 과정 대상(전임직원/개발자/보안담당자)의 이수 의무자 기준.
                      재직자 스코프(퇴사자 이력 분자 제외)와 대상 스코프(비대상자 분모 제외)를 함께 반영. */}
                  <td className="num">{eligible(c.target).filter((p) => recordsOf(c.id).some((r) => r.name === p.name)).length} / {eligible(c.target).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && (
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addCourse} className="hstack">
              <input aria-label="교육 과정명" className="input" name="title" required maxLength={120} placeholder="교육 과정명" style={{ flex: 1 }} />
              <select aria-label="점검 대상" className="select" name="target">
                {TARGETS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input aria-label="plannedMonth" className="input" name="plannedMonth" required type="month" defaultValue={today().slice(0, 7)} />
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
              const missing = eligible(c.target).filter((p) => !recordsOf(c.id).some((r) => r.name === p.name))
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
                        <input aria-label="names" type="checkbox" name="names" value={p.name} /> {p.name}
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
                           !eligible(c.target).some((p) => p.name === me.name) ? <Chip tone="neutral" bare>해당없음</Chip> :
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
                    const req = eligibleDone(p.name).length  // 이 사람이 대상인 완료 과정 수(비대상 과정 제외)
                    return (
                      <tr key={p.name}>
                        <td className="strong">{p.name}</td>
                        <td>{p.dept}</td>
                        <td className="num">{n} / {req}</td>
                        <td>{n >= req ? <Chip tone="ok" bare>완료</Chip> : <Chip tone="err" bare>미이수</Chip>}</td>
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

      {/* 게시/공지 이력 (요구사항 61행·제품안내서 IV장) — 교육 분류 공지의 완료 내역·첨부를 교육 도메인에서 조회 */}
      <Card title="게시 · 공지 이력" kicker="Postings" pad={false}>
        {s.notices.filter((n) => n.category === '교육').length === 0 ? (
          <div className="empty">교육 분류의 게시/공지 이력이 없습니다 — 공지사항에서 '교육' 분류로 등록하면 여기에 모입니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>게시일</th></tr></thead>
              <tbody>
                {s.notices.filter((n) => n.category === '교육').map((n) => (
                  <tr key={n.id}>
                    <td className="code">{n.id}</td>
                    <td className="strong">{n.title}<Clip count={attachCount(n.id)} title="게시 원본 첨부" /></td>
                    <td>{n.author}</td>
                    <td className="tnum">{n.postedAt}</td>
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
