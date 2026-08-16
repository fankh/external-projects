import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { NAV } from '@/components/chrome/menus'
import { ACCOUNTS } from '@/lib/session'
import { getStore, nextNo } from '@/lib/store'

const DOMAINS = NAV.map((g) => g.label).filter((l) => l !== 'Main' && l !== 'My Work')

async function ask(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/board/qna', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 160)
  const domain = String(formData.get('domain') ?? '')
  if (!title || !DOMAINS.includes(domain)) return
  const s = getStore()
  const id = nextNo('QA', today().slice(0, 4), s.qna.map((q) => q.id))
  s.qna.unshift({ id, title, domain, author: me.name, dept: me.dept, askedAt: today() })
  // 문의 첨부 (첨부 시트: 공지사항 및 QnA — boards)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/board/qna')
}

async function assign(formData: FormData) {
  'use server'
  await requireMenuRole('/board/qna', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const assignee = String(formData.get('assignee') ?? '')
  const s = getStore()
  const q = s.qna.find((x) => x.id === id && !x.answer)
  // 담당 지정 대상은 '실제 답변 가능한' 역할(BIZ_MGR·ADMIN)로 한정한다 — answer()·canAnswer 게이트와 정합.
  // role !== 'USER' 로 두면 DEPT_MGR 도 지정되나 DEPT_MGR 은 답변 폼이 없어 지정이 막다른 길이 된다(게이트 불일치).
  if (!q || !ACCOUNTS.some((a) => a.name === assignee && (a.role === 'BIZ_MGR' || a.role === 'ADMIN'))) return
  q.assignee = assignee
  // 폐쇄 루프 — 담당 지정 시 답변 할일 생성(재지정이면 이전 담당 할일 닫고 새로 발급). 답변 완료로 닫힌다.
  for (const t of s.todos) {
    if (!t.done && t.kind === 'QnA' && t.title.startsWith(`${id} `)) t.done = true
  }
  s.todos.unshift({
    id: nextNo('TD', today().slice(0, 4), s.todos.map((t) => t.id)),
    owner: assignee, kind: 'QnA', title: `${id} 답변`, dueDate: today(), done: false,
  })
  revalidatePath('/', 'layout')
}

async function answer(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/board/qna', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const body = String(formData.get('answer') ?? '').trim().slice(0, 500)
  if (!body) return
  const s = getStore()
  const q = s.qna.find((x) => x.id === id && !x.answer)
  if (!q) return
  q.answer = body
  q.answeredBy = me.name
  q.answeredAt = today()
  // 폐쇄 루프 — 답변 완료 시 담당의 QnA 할일을 닫는다(id 선두 고정, 다른 관리자가 답변해도 닫힘).
  for (const t of s.todos) {
    if (!t.done && t.kind === 'QnA' && t.title.startsWith(`${id} `)) t.done = true
  }
  revalidatePath('/', 'layout')
}

/** 문의 삭제 — 미답변 건의 작성자 본인, 또는 Admin (요구사항 6행 삭제 ◎). 첨부도 함께 정리한다 */
async function deleteQna(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/board/qna', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const q = s.qna.find((x) => x.id === id)
  if (!q) return
  const mineUnanswered = q.author === me.name && !q.answer
  if (!mineUnanswered && me.role !== 'ADMIN') return
  s.qna = s.qna.filter((x) => x.id !== id)
  s.attachments = s.attachments.filter((a) => a.refId !== id)
  audit(me.name, '게시물 삭제', `QnA ${id} — ${q.title}`)
  revalidatePath('/board/qna')
}

export default async function QnaPage() {
  const me = await requireMenu('/board/qna')
  const s = getStore()
  const canAnswer = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const open = s.qna.filter((q) => !q.answer)

  return (
    <>
      <ScreenHeader kicker="Main" title="QnA"
        desc="포털 업무 문의 — 업무 도메인을 지정해 질문하면 담당자가 답변한다." />

      <div className="stat-row">
        <Stat value={s.qna.length} label="전체 문의" />
        <Stat value={open.length} label="답변 대기" tone={open.length > 0 ? 'warn' : undefined} />
        <Stat value={s.qna.length - open.length} label="답변 완료" />
      </div>

      <Card title="질문 등록" kicker="Ask">
        <form action={ask} className="hstack">
          <select aria-label="도메인" className="select" name="domain">
            {DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input aria-label="문의 내용" className="input" name="title" required maxLength={160} placeholder="문의 내용" style={{ flex: 1 }} />
          <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="문의 첨부" />
          <button type="submit" className="btn pri">등록</button>
        </form>
      </Card>

      <Card title="문의 목록" kicker="Questions" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>번호</th><th>도메인</th><th>문의</th><th>작성자</th><th>담당</th><th>등록일</th><th style={{ maxWidth: 420 }}>답변</th></tr></thead>
            <tbody>
              {s.qna.map((q) => (
                <tr key={q.id}>
                  <td className="code">{q.id}</td>
                  <td><Chip tone="neutral" bare>{q.domain}</Chip></td>
                  <td className="strong" style={{ maxWidth: 320 }}>{q.title}<Clip count={attachCount(q.id)} title="문의 첨부" /></td>
                  <td>{q.author} <span className="mut">· {q.dept}</span></td>
                  <td>
                    {q.assignee ? (
                      <Chip tone="info" bare>{q.assignee}</Chip>
                    ) : canAnswer && !q.answer ? (
                      <form action={assign} className="hstack" style={{ gap: 4, padding: '3px 0' }}>
                        <input type="hidden" name="id" value={q.id} />
                        <select aria-label="담당" className="select" name="assignee" style={{ height: 25, fontSize: 11.5 }}>
                          {ACCOUNTS.filter((a) => a.role === 'BIZ_MGR' || a.role === 'ADMIN').map((a) => <option key={a.login} value={a.name}>{a.name}</option>)}
                        </select>
                        <button type="submit" className="btn sm">담당 지정</button>
                      </form>
                    ) : (
                      <span className="mut">-</span>
                    )}
                  </td>
                  <td className="tnum">
                    {q.askedAt}
                    {((q.author === me.name && !q.answer) || me.role === 'ADMIN') && (
                      <form action={deleteQna} style={{ display: 'inline', marginLeft: 6 }}>
                        <input type="hidden" name="id" value={q.id} />
                        <button type="submit" className="btn sm danger">삭제</button>
                      </form>
                    )}
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    {q.answer ? (
                      <span className="dim" title={q.answer}>
                        <Chip tone="ok" bare>답변완료</Chip> {q.answer} <span className="mut">— {q.answeredBy} · {q.answeredAt}</span>
                      </span>
                    ) : canAnswer ? (
                      <form action={answer} className="hstack" style={{ padding: '3px 0' }}>
                        <input type="hidden" name="id" value={q.id} />
                        <input aria-label="답변 내용" className="input" name="answer" required maxLength={500} placeholder="답변 내용" style={{ height: 25, fontSize: 11.5, flex: 1 }} />
                        <button type="submit" className="btn sm pri">답변</button>
                      </form>
                    ) : (
                      <Chip tone="warn" bare>답변 대기</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
