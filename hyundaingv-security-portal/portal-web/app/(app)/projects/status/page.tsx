import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { effectiveRoles, requireMenu, requireMenuRole } from '@/lib/authz'
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
  // 완료 확정된 프로젝트는 진척 재편집 불가 — 화면은 완료 프로젝트에 폼을 숨기나(클라이언트) 서버액션은
  // 직접 POST 가능하므로, 조작 요청이 완료 건을 진행중으로 되돌리지(진척 하향) 못하게 서버에서 가드한다.
  if (!pj || pj.status === '완료') return
  pj.progress = Math.round(progress)
  // 폐쇄 루프 — 진척 100% 는 완료로 확정된다
  pj.status = pj.progress >= 100 ? '완료' : '진행중'
  // 폐쇄 루프 — 완료 확정 시, 이 프로젝트 멤버 중 서명 대상 '진행중' 프로젝트가 더는 없는 사람의
  // '프로젝트 보안서약서 재서약' 할일을 닫는다. 이 할일은 signProject(서명)로만 닫히는데(진행중 프로젝트만
  // 서명 가능), 멤버의 유일 참여 프로젝트가 서명 전에 완료되면 서명할 진행중 프로젝트가 없어 할일이 영구
  // 방치되고 notify 재서약 안내가 매 배치 재발송되던 결함(프로젝트 완료 생명주기의 미정리 구멍)을 막는다.
  if (pj.status === '완료') {
    const pjRevised = s.pledgeForms.find((f) => f.kind === '프로젝트')?.revisedAt ?? '0000-00-00'
    for (const name of pj.members ?? []) {
      const stillOwes = s.projects.some((p) => p.status === '진행중' && (p.members ?? []).includes(name) &&
        !s.pledges.some((x) => x.name === name && x.kind === '프로젝트' && x.projectRef === p.id && x.signedAt >= pjRevised))
      if (!stillOwes) {
        const todo = s.todos.find((t) => t.owner === name && t.kind === '보안서약서' && t.title.includes('프로젝트 보안서약서') && !t.done)
        if (todo) todo.done = true
      }
    }
  }
  revalidatePath('/projects/status')
}

export default async function ProjectStatusPage() {
  const me = await requireMenu('/projects/status')
  const s = getStore()
  const t = today()
  // 연동 계약(거래처·계약목록)은 재무(/finance) 도메인 신호다 — 프로젝트 화면은 자기 메뉴로만 게이트되므로,
  // ADMIN 이 재무 메뉴를 담당자에서 제한해도 여기 거래처명·계약목록으로 재무 데이터가 새어 나간다. 출처
  // 재무 유효권한으로 가드한다(교차도메인 게이트 클래스 완결). 계약↔프로젝트 연동 요구는 유지하되, 재무
  // 미열람자는 거래처·계약목록을 못 보게 하고 '-'·연동안함으로 저하한다.
  const canSeeFinance = effectiveRoles('/finance/invest').includes(me.role) || effectiveRoles('/finance/expense').includes(me.role)

  const active = s.projects.filter((p) => p.status === '진행중')
  const late = active.filter((p) => p.end < t)
  const openIssues = s.projectIssues.filter((i) => i.status === '오픈')
  const contractOf = (id?: string) => s.investContracts.find((c) => c.id === id)
  // 프로젝트 참여 서약 제출 수 — 현 개정본 유효 서명만, 인별 중복 제거하고 현재 명단으로 한정한다.
  // (양식 개정 후 재서약분과 개정 전 stale 행이 함께 세어져 미서약을 감추던 결함)
  const pjRevised = s.pledgeForms.find((f) => f.kind === '프로젝트')?.revisedAt ?? '0000-00-00'
  const signedCount = (p: { id: string; members?: string[] }) => {
    const names = new Set(s.pledges.filter((x) => x.kind === '프로젝트' && x.projectRef === p.id && x.signedAt >= pjRevised).map((x) => x.name))
    // 명단은 '비어있음'과 '미지정(undefined)'을 동일 취급 — 명단 없는 프로젝트는 참여자 전원을 센다.
    // 옵셔널 members 가 파일 영속화·재로딩에서 undefined→[] 로 정규화돼도(빈 배열은 truthy) 집계가
    // 0 으로 떨어지지 않게 length 로 판정한다(인메모리=names.size 였다가 재시작 후 0 이 되던 결함).
    return p.members && p.members.length > 0 ? p.members.filter((m) => names.has(m)).length : names.size
  }

  return (
    <>
      <ScreenHeader kicker="프로젝트" title="진행현황 · 인력투입"
        desc="계약 연동 프로젝트의 진척률과 투입 인력" />

      <div className="stat-row">
        <Stat value={active.length} label="진행중" note={`전체 ${s.projects.length}건`} />
        <Stat value={active.length ? Math.round(active.reduce((sum, p) => sum + p.progress, 0) / active.length) + '%' : '-'} label="평균 진척" />
        <Stat value={openIssues.length} label="오픈 이슈" tone={openIssues.length > 0 ? 'warn' : undefined} />
        <Stat value={late.length} label="기한 경과" tone={late.length > 0 ? 'err' : undefined} note={`오늘 ${t}`} />
      </div>

      <Card title="프로젝트 목록" pad={false}
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
                    <td>{ct && canSeeFinance ? <span>{ct.vendor} <span className="mut mono">{ct.id}</span></span> : <span className="mut">-</span>}</td>
                    <td>{p.manager}</td>
                    <td className="num" title={p.members?.join(' · ') ?? '명단 미등록'}>{p.headcount}명{p.members && <span className="mut"> ({p.members.length})</span>}</td>
                    {/* 요구사항 46행 — 사내인력 프로젝트 참여 서약 (보안서약서 > 특별서약서(프로젝트)) 제출 수 */}
                    <td className="num">{signedCount(p)}건</td>
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
                          <input aria-label="progress" className="input" name="progress" type="number" min={0} max={100} defaultValue={p.progress} style={{ height: 25, fontSize: 11.5, width: 64 }} />
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
            <input aria-label="프로젝트명" className="input" name="title" required maxLength={120} placeholder="프로젝트명" style={{ flex: 1, minWidth: 200 }} />
            <select aria-label="계약" className="select" name="contractId">
              <option value="">계약 연동 안 함</option>
              {canSeeFinance && s.investContracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
            </select>
            <input aria-label="인력" className="input" name="headcount" required type="number" min={1} placeholder="인력" style={{ width: 70 }} />
            <select className="select" name="members" multiple size={3} title="투입 인력 명단 (Ctrl 다중 선택) — 참여 서약 대상 기준" style={{ width: 120, height: 58 }}>
              {s.people.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <input aria-label="시작일" className="input" name="start" required type="date" />
            <input aria-label="종료일" className="input" name="end" required type="date" />
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
