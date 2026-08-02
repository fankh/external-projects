import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { NAV } from '@/components/chrome/menus'
import { ACCOUNTS } from '@/lib/session'
import { getStore, nextNo } from '@/lib/store'

const DOMAINS = NAV.map((g) => g.label).filter((l) => l !== 'Main' && l !== 'My Work')

async function ask(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 160)
  const domain = String(formData.get('domain') ?? '')
  if (!title || !DOMAINS.includes(domain)) return
  const s = getStore()
  s.qna.unshift({
    id: nextNo('QA', today().slice(0, 4), s.qna.map((q) => q.id)),
    title, domain, author: me.name, dept: me.dept, askedAt: today(),
  })
  revalidatePath('/board/qna')
}

async function assign(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const assignee = String(formData.get('assignee') ?? '')
  const s = getStore()
  const q = s.qna.find((x) => x.id === id && !x.answer)
  if (!q || !ACCOUNTS.some((a) => a.name === assignee && a.role !== 'USER')) return
  q.assignee = assignee
  revalidatePath('/board/qna')
}

async function answer(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const body = String(formData.get('answer') ?? '').trim().slice(0, 500)
  if (!body) return
  const s = getStore()
  const q = s.qna.find((x) => x.id === id && !x.answer)
  if (!q) return
  q.answer = body
  q.answeredBy = me.name
  q.answeredAt = today()
  revalidatePath('/board/qna')
}

export default async function QnaPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
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
          <select className="select" name="domain">
            {DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input className="input" name="title" required maxLength={160} placeholder="문의 내용" style={{ flex: 1 }} />
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
                  <td className="strong" style={{ maxWidth: 320 }}>{q.title}</td>
                  <td>{q.author} <span className="mut">· {q.dept}</span></td>
                  <td>
                    {q.assignee ? (
                      <Chip tone="info" bare>{q.assignee}</Chip>
                    ) : canAnswer && !q.answer ? (
                      <form action={assign} className="hstack" style={{ gap: 4, padding: '3px 0' }}>
                        <input type="hidden" name="id" value={q.id} />
                        <select className="select" name="assignee" style={{ height: 25, fontSize: 11.5 }}>
                          {ACCOUNTS.filter((a) => a.role !== 'USER').map((a) => <option key={a.login} value={a.name}>{a.name}</option>)}
                        </select>
                        <button type="submit" className="btn sm">담당 지정</button>
                      </form>
                    ) : (
                      <span className="mut">-</span>
                    )}
                  </td>
                  <td className="tnum">{q.askedAt}</td>
                  <td style={{ maxWidth: 420 }}>
                    {q.answer ? (
                      <span className="dim" title={q.answer}>
                        <Chip tone="ok" bare>답변완료</Chip> {q.answer} <span className="mut">— {q.answeredBy} · {q.answeredAt}</span>
                      </span>
                    ) : canAnswer ? (
                      <form action={answer} className="hstack" style={{ padding: '3px 0' }}>
                        <input type="hidden" name="id" value={q.id} />
                        <input className="input" name="answer" required maxLength={500} placeholder="답변 내용" style={{ height: 25, fontSize: 11.5, flex: 1 }} />
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
