import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

async function addProject(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/projects/status', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const contractId = String(formData.get('contractId') ?? '')
  const headcount = Number(formData.get('headcount'))
  const start = String(formData.get('start') ?? '')
  const end = String(formData.get('end') ?? '')
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!title || !Number.isFinite(headcount) || headcount < 1 || !dateRe.test(start) || !dateRe.test(end) || end < start) return
  const s = getStore()
  const id = nextNo('PJ', today().slice(0, 4), s.projects.map((p) => p.id))
  // 투입 인력 명단 — 실존 인원만, 프로젝트 참여 서약 대상의 기준이 된다 (제품안내서 III장)
  // 중복 제거 + 상한 (F4) — 실존 인원만
  const members = [...new Set(formData.getAll('members').map(String))].filter((n) => s.people.some((p) => p.name === n)).slice(0, 100)
  s.projects.unshift({
    id, title, contractId: s.investContracts.some((c) => c.id === contractId) ? contractId : undefined,
    manager: me.name, headcount: Math.round(headcount), members: members.length > 0 ? members : undefined,
    start, end, progress: 0, status: '진행중',
  })
  // 인력투입계획서 등 프로젝트 문서 — 공통 첨부 (첨부 시트: 프로젝트 인력투입계획)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/projects/status')
}

async function updateProgress(formData: FormData) {
  'use server'
  await requireMenuRole('/projects/status', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const progress = Number(formData.get('progress'))
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return
  const s = getStore()
  const pj = s.projects.find((p) => p.id === id)
  if (!pj) return
  pj.progress = Math.round(progress)
  // 폐쇄 루프 — 진척 100% 는 완료로 확정된다
  pj.status = pj.progress >= 100 ? '완료' : '진행중'
  revalidatePath('/projects/status')
}

export default async function ProjectStatusPage() {
  await requireMenu('/projects/status')
  const s = getStore()
  const t = today()

  const active = s.projects.filter((p) => p.status === '진행중')
  const late = active.filter((p) => p.end < t)
  const openIssues = s.projectIssues.filter((i) => i.status === '오픈')
  const contractOf = (id?: string) => s.investContracts.find((c) => c.id === id)

  return (
    <>
      <ScreenHeader kicker="프로젝트" title="진행현황 · 인력투입"
        desc="계약정보 연동으로 프로젝트를 등록하고 진척·인력·완료 예정일을 추적한다." />

      <div className="stat-row">
        <Stat value={active.length} label="진행중" note={`전체 ${s.projects.length}건`} />
        <Stat value={active.length ? Math.round(active.reduce((sum, p) => sum + p.progress, 0) / active.length) + '%' : '-'} label="평균 진척" />
        <Stat value={openIssues.length} label="오픈 이슈" tone={openIssues.length > 0 ? 'warn' : undefined} />
        <Stat value={late.length} label="기한 경과" tone={late.length > 0 ? 'err' : undefined} note={`오늘 ${t}`} />
      </div>

      <Card title="프로젝트 목록" kicker="Projects" pad={false}
        actions={<a className="btn sm" href="/api/export?type=projects">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>번호</th><th>프로젝트</th><th>연동 계약</th><th>PM</th><th className="num">투입 인력</th><th className="num">참여 서약</th><th>기간</th><th style={{ width: 180 }}>진척</th><th>상태</th><th className="c">진척 갱신</th></tr>
            </thead>
            <tbody>
              {s.projects.map((p) => {
                const ct = contractOf(p.contractId)
                return (
                  <tr key={p.id}>
                    <td className="code">{p.id}</td>
                    <td className="strong">{p.title}<Clip count={attachCount(p.id)} title="프로젝트 문서 (인력투입계획 등)" /></td>
                    <td>{ct ? <span>{ct.vendor} <span className="mut mono">{ct.id}</span></span> : <span className="mut">-</span>}</td>
                    <td>{p.manager}</td>
                    <td className="num" title={p.members?.join(' · ') ?? '명단 미등록'}>{p.headcount}명{p.members && <span className="mut"> ({p.members.length})</span>}</td>
                    {/* 요구사항 46행 — 사내인력 프로젝트 참여 서약 (보안서약서 > 특별서약서(프로젝트)) 제출 수 */}
                    <td className="num">{s.pledges.filter((x) => x.kind === '프로젝트' && x.projectRef === p.id).length}건</td>
                    <td className="tnum">{p.start} ~ {p.end} {p.status !== '완료' && p.end < t && <Chip tone="err" bare>경과</Chip>}</td>
                    <td>
                      <div className="hstack" style={{ gap: 7 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${p.progress}%`, height: '100%', background: p.progress >= 100 ? 'var(--ok)' : 'var(--ink)' }} />
                        </div>
                        <span className="tnum" style={{ fontSize: 11.5, width: 34, textAlign: 'right' }}>{p.progress}%</span>
                      </div>
                    </td>
                    <td>{p.status === '완료' ? <Chip tone="ok">완료</Chip> : <Chip tone="info">진행중</Chip>}</td>
                    <td className="c">
                      {p.status === '완료' ? <span className="mut">-</span> : (
                        <form action={updateProgress} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input className="input" name="progress" type="number" min={0} max={100} defaultValue={p.progress} style={{ height: 25, fontSize: 11.5, width: 64 }} />
                          <button type="submit" className="btn sm">갱신</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
          <form action={addProject} className="hstack" style={{ flexWrap: 'wrap' }}>
            <input className="input" name="title" required maxLength={120} placeholder="프로젝트명" style={{ flex: 1, minWidth: 200 }} />
            <select className="select" name="contractId">
              <option value="">계약 연동 안 함</option>
              {s.investContracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
            </select>
            <input className="input" name="headcount" required type="number" min={1} placeholder="인력" style={{ width: 70 }} />
            <select className="select" name="members" multiple size={3} title="투입 인력 명단 (Ctrl 다중 선택) — 참여 서약 대상 기준" style={{ width: 120, height: 58 }}>
              {s.people.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <input className="input" name="start" required type="date" />
            <input className="input" name="end" required type="date" />
            <input className="input" type="file" name="file" style={{ width: 170, paddingTop: 4 }} title="인력투입계획서 등 첨부" />
            <button type="submit" className="btn pri">프로젝트 등록</button>
          </form>
        </div>
      </Card>

      <div className="callout">
        <b>연계</b> — 산출물·이슈는 <b>일정 · 산출물 · 이슈</b> 화면에서, 회의록·주간보고는 <b>회의록 · 주간보고</b>
        화면에서 관리한다. 진척 100% 등록 시 완료로 확정된다.
      </div>
    </>
  )
}
