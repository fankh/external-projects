import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

async function addNote(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/projects/reports', 'BIZ_MGR', 'ADMIN')
  const projectId = String(formData.get('projectId') ?? '')
  const kind = String(formData.get('kind') ?? '') as '회의록' | '주간보고'
  const title = String(formData.get('title') ?? '').trim().slice(0, 160)
  const s = getStore()
  if (!s.projects.some((p) => p.id === projectId) || !['회의록', '주간보고'].includes(kind) || !title) return
  const id = nextNo('PN', today().slice(0, 4), s.projectNotes.map((n) => n.id))
  s.projectNotes.unshift({ id, projectId, kind, title, author: me.name, writtenAt: today() })
  // 회의록·주간보고 원본 파일 — 공통 첨부 (첨부 시트: 프로젝트 회의록·주간보고)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/projects/reports')
}

export default async function ReportsPage() {
  await requireMenu('/projects/reports')
  const s = getStore()
  const projectOf = (id: string) => s.projects.find((p) => p.id === id)
  const thisWeekNotes = s.projectNotes.filter((n) => n.kind === '주간보고')

  return (
    <>
      <ScreenHeader kicker="프로젝트" title="회의록 · 주간보고"
        desc="프로젝트 커뮤니케이션 기록 — 회의록과 주간보고를 원본 파일 첨부와 함께 작성·조회한다." />

      <div className="stat-row">
        <Stat value={s.projectNotes.length} label="전체 기록" />
        <Stat value={s.projectNotes.filter((n) => n.kind === '회의록').length} label="회의록" />
        <Stat value={thisWeekNotes.length} label="주간보고" />
      </div>

      <Card title="작성">
        <form action={addNote} className="hstack" style={{ flexWrap: 'wrap' }}>
          <select aria-label="projectId" className="select" name="projectId">
            {s.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
          </select>
          <select aria-label="유형" className="select" name="kind">
            <option>주간보고</option><option>회의록</option>
          </select>
          <input aria-label="제목" className="input" name="title" required maxLength={160} placeholder="제목 (예: 8월 1주차 — 개발 진행, 정합성 이슈 대응)" style={{ flex: 1 }} />
          <input className="input" type="file" name="file" style={{ width: 170, paddingTop: 4 }} title="회의록·주간보고 원본 첨부" />
          <button type="submit" className="btn pri">등록</button>
        </form>
      </Card>

      <Card title="기록 목록" pad={false}>
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
                    <td className="strong">{n.title}<Clip count={attachCount(n.id)} title="원본 파일" /></td>
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
