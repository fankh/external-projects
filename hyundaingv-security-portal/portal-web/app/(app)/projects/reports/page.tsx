import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

async function addNote(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const kind = String(formData.get('kind') ?? '') as '회의록' | '주간보고'
  const title = String(formData.get('title') ?? '').trim().slice(0, 160)
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !['회의록', '주간보고'].includes(kind) || !title) return
  s.projectNotes.unshift({
    id: nextNo('PN', today().slice(0, 4), s.projectNotes.map((n) => n.id)),
    projectId, kind, title, author: me.name, writtenAt: today(),
  })
  revalidatePath('/projects/reports')
}

export default async function ReportsPage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const projectOf = (id: string) => s.projects.find((p) => p.id === id)
  const thisWeekNotes = s.projectNotes.filter((n) => n.kind === '주간보고')

  return (
    <>
      <ScreenHeader kicker="프로젝트" title="회의록 · 주간보고"
        desc="프로젝트 커뮤니케이션 기록 — 회의록과 주간보고를 작성·조회한다 (첨부는 이후 버전)." />

      <div className="stat-row">
        <Stat value={s.projectNotes.length} label="전체 기록" />
        <Stat value={s.projectNotes.filter((n) => n.kind === '회의록').length} label="회의록" />
        <Stat value={thisWeekNotes.length} label="주간보고" />
      </div>

      <Card title="작성" kicker="New">
        <form action={addNote} className="hstack">
          <select className="select" name="projectId">
            {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
          </select>
          <select className="select" name="kind">
            <option>주간보고</option><option>회의록</option>
          </select>
          <input className="input" name="title" required maxLength={160} placeholder="제목 (예: 8월 1주차 — 개발 진행, 정합성 이슈 대응)" style={{ flex: 1 }} />
          <button type="submit" className="btn pri">등록</button>
        </form>
      </Card>

      <Card title="기록 목록" kicker="Notes" pad={false}>
        {s.projectNotes.length === 0 ? (
          <div className="empty">작성된 기록이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>번호</th><th>구분</th><th>프로젝트</th><th>제목</th><th>작성자</th><th>작성일</th></tr></thead>
              <tbody>
                {s.projectNotes.map((n) => (
                  <tr key={n.id}>
                    <td className="code">{n.id}</td>
                    <td><Chip tone={n.kind === '주간보고' ? 'info' : 'neutral'} bare>{n.kind}</Chip></td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{projectOf(n.projectId)?.id}</td>
                    <td className="strong">{n.title}</td>
                    <td>{n.author}</td>
                    <td className="tnum">{n.writtenAt}</td>
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
