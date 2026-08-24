import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireAction, requireMenu } from '@/lib/authz'
import { today } from '@/lib/dates'
import { ACCOUNTS } from '@/lib/session'
import { getStore, nextNo } from '@/lib/store'
import { SR_CHIP, srStatusLabel } from '../chips'

async function assignCi(formData: FormData) {
  'use server'
  const me = await requireAction('/sr/ci', 'save')
  const srNo = String(formData.get('srNo') ?? '')
  const ci = String(formData.get('ci') ?? '').trim().slice(0, 40)
  const dueDate = String(formData.get('dueDate') ?? '')
  // 담당 CI 는 실존 업무담당(BIZ_MGR·ADMIN)만 — 셀렉트 후보(ciCandidates)와 동일 집합으로 검증한다.
  // (role !== 'USER' 는 DEPT_MGR 도 통과시켜, 임의 POST 로 /sr/manage 못 여는 담당이 배정될 수 있었음)
  if (!ACCOUNTS.some((a) => a.name === ci && (a.role === 'BIZ_MGR' || a.role === 'ADMIN')) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return

  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === 'CI배정')
  if (!sr) return
  sr.ci = ci
  sr.dueDate = dueDate
  sr.status = '개발중'
  // BA 검토 증적 — SR 번호(pk) 하나로 신청·BA·결과 첨부를 공유한다 (첨부 시트: SR신청내역 BA승인)
  registerUpload(srNo, formData.get('file'), me.name)

  // 폐쇄 루프 — 'SR 처리' 할일이 배정과 함께 닫힌다. 할일 소유자는 업무담당(BIZ_MGR)이고 배정은
  // BIZ_MGR·ADMIN 이 하므로, owner==me.name 으로 매칭하면 ADMIN 이 배정할 때 할일이 안 닫혀 방치된다.
  // SR 당 'SR 처리' 할일은 유일하므로 유형+SR번호로 닫는다(소유자 무관).
  const todo = s.todos.find((t) => t.kind === 'SR 처리' && t.title.startsWith(`${srNo} `) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

async function baReject(formData: FormData) {
  'use server'
  await requireAction('/sr/ci', 'save')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === 'CI배정')
  if (!sr) return
  sr.status = '반려'
  // BA 반려도 CI배정 상태를 벗어나므로 'SR 처리'(CI 배정) 할일을 닫는다 — 안 닫으면 반려된 SR 의
  // 배정 의무가 업무담당 할일함에 영구 잔류한다(배정 경로만 닫던 반쪽 루프).
  const todo = s.todos.find((t) => t.kind === 'SR 처리' && t.title.startsWith(`${srNo} `) && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

/** 결재 없는 CI 직접 접수 (요구사항 25행) — 전화·메일 등으로 들어온 건을 보안/업무 구분으로 접수한다 */
async function receiveCiSr(formData: FormData) {
  'use server'
  const me = await requireAction('/sr/ci', 'save')
  const category = String(formData.get('category') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const requester = String(formData.get('requester') ?? '').trim().slice(0, 60)
  const system = String(formData.get('system') ?? '').trim().slice(0, 80)
  if ((category !== '보안' && category !== '업무') || !title || !requester) return
  const s = getStore()
  // 이중 접수 방지 — 서버액션 폼은 제출 후 자동 비활성화되지 않아 더블클릭·재전송으로 같은 건이 두 번
  // 접수되면 각자 접수→처리중→완료를 밟아 중복 이력이 된다(createSr v1.5.50 과 동일 가드).
  if (s.ciSrs.some((c) => c.title === title && c.requester === requester && c.status === '접수')) return
  const id = nextNo('CS', today().slice(0, 4), s.ciSrs.map((c) => c.id))
  s.ciSrs.unshift({ id, category, title, requester, system: system || undefined, status: '접수', receivedBy: me.name, receivedAt: today() })
  // 접수 근거 첨부 (첨부 시트: CI SR관리)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/', 'layout')
}

/** CI SR 처리 전이 — 접수 → 처리중 → 완료(처리 내용 기록) */
async function advanceCiSr(formData: FormData) {
  'use server'
  await requireAction('/sr/ci', 'save')
  const id = String(formData.get('id') ?? '')
  const result = String(formData.get('result') ?? '').trim().slice(0, 300)
  const s = getStore()
  const c = s.ciSrs.find((x) => x.id === id)
  if (!c || c.status === '완료') return
  if (c.status === '접수') {
    c.status = '처리중'
  } else {
    if (!result) return
    c.status = '완료'
    c.result = result
    c.completedAt = today()
  }
  revalidatePath('/sr/ci')
}

export default async function SrCiPage() {
  await requireMenu('/sr/ci')
  const s = getStore()

  const waiting = s.srRequests.filter((r) => r.status === 'CI배정')
  const assigned = s.srRequests.filter((r) => r.ci && r.status !== 'CI배정' && r.status !== '반려')
  const ciCandidates = ACCOUNTS.filter((a) => a.role === 'BIZ_MGR' || a.role === 'ADMIN')

  return (
    <>
      <ScreenHeader kicker="서비스요청" title="CI SR 관리"
        desc="결재 완료 SR의 BA 검토·CI 배정, 결재 없는 건의 직접 접수" />

      <div className="stat-row">
        <Stat value={waiting.length} label="배정 대기" tone={waiting.length > 0 ? 'warn' : undefined} note="결재 완료 건" />
        <Stat value={assigned.length} label="배정 완료" />
        <Stat value={s.ciSrs.filter((c) => c.status !== '완료').length} label="직접 접수 진행중" note="결재 없는 건"
          tone={s.ciSrs.some((c) => c.status !== '완료') ? 'warn' : undefined} />
        <Stat value={s.ciSrs.filter((c) => c.status === '완료').length} label="직접 접수 완료" />
      </div>

      <Card title="배정 대기 — BA 검토" pad={false}>
        {waiting.length === 0 ? (
          <div className="empty">배정 대기 중인 SR이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>SR번호</th><th>유형</th><th>제목</th><th>신청자</th><th>담당 CI</th><th>완료 예정</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {waiting.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="strong">{r.title}<Clip count={attachCount(r.srNo)} title="SR 첨부" /></td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td colSpan={3}>
                      <form action={assignCi} className="hstack" style={{ padding: '3px 0', flexWrap: 'wrap' }}>
                        <input type="hidden" name="srNo" value={r.srNo} />
                        <select aria-label="ci" className="select" name="ci" required style={{ height: 25, fontSize: 11.5 }}>
                          {ciCandidates.map((c) => <option key={c.login} value={c.name}>{c.name} ({c.dept})</option>)}
                        </select>
                        <input aria-label="지급 예정일" className="input" type="date" name="dueDate" required defaultValue={today()} style={{ height: 25, fontSize: 11.5 }} />
                        <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 140, paddingTop: 2 }} title="BA 검토 증적 첨부" />
                        <button type="submit" className="btn sm pri">배정 · 착수</button>
                        <button type="submit" className="btn sm danger" formAction={baReject}>BA 반려</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="CI SR 접수 — 결재 없는 건">
        <form action={receiveCiSr} className="hstack" style={{ flexWrap: 'wrap' }}>
          <select className="select" name="category" required title="보안/업무 구분">
            <option>보안</option><option>업무</option>
          </select>
          <input aria-label="요청 제목" className="input" name="title" required maxLength={120} placeholder="요청 제목" style={{ flex: 2, minWidth: 180 }} />
          <input aria-label="요청자" className="input" name="requester" required maxLength={60} placeholder="요청자 (사외·관제 포함)" style={{ width: 150 }} />
          <input aria-label="대상 시스템" className="input" name="system" maxLength={80} placeholder="대상 시스템" style={{ width: 130 }} />
          <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="접수 근거 첨부" />
          <button type="submit" className="btn pri">접수</button>
        </form>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
          전화·메일 등으로 들어온 결재 불요 건 — 접수 → 처리중 → 완료(처리 내용 기록)로 이력이 남는다.
        </div>
      </Card>

      <Card title="CI SR 처리 이력" pad={false}
        actions={<a className="btn sm" href="/api/export?type=ci-srs">엑셀 다운로드</a>}>
        {s.ciSrs.length === 0 ? (
          <div className="empty">직접 접수한 건이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>구분</th><th>제목</th><th>요청자</th><th>접수자</th><th>상태</th><th>접수일</th><th>완료일</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {s.ciSrs.map((c) => (
                  <tr key={c.id}>
                    <td className="code">{c.id}</td>
                    <td><Chip tone={c.category === '보안' ? 'err' : 'info'} bare>{c.category}</Chip></td>
                    <td className="strong">
                      {c.title}<Clip count={attachCount(c.id)} title="접수 근거 첨부" />
                      {c.system && <span className="mut"> · {c.system}</span>}
                      {c.result && <div className="dim" style={{ fontSize: 11 }}>처리: {c.result}</div>}
                    </td>
                    <td>{c.requester}</td>
                    <td>{c.receivedBy}</td>
                    <td><Chip tone={c.status === '완료' ? 'ok' : c.status === '처리중' ? 'warn' : 'info'}>{c.status}</Chip></td>
                    <td className="tnum">{c.receivedAt}</td>
                    <td className="tnum">{c.completedAt ?? '-'}</td>
                    <td className="c">
                      {c.status === '접수' && (
                        <form action={advanceCiSr} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="btn sm">처리 시작</button>
                        </form>
                      )}
                      {c.status === '처리중' && (
                        <form action={advanceCiSr} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={c.id} />
                          <input aria-label="처리 내용" className="input" name="result" required maxLength={300} placeholder="처리 내용" style={{ height: 25, fontSize: 11.5, width: 150 }} />
                          <button type="submit" className="btn sm pri">완료</button>
                        </form>
                      )}
                      {c.status === '완료' && <span className="mut">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="배정 완료 — 진행중" pad={false}>
        {assigned.length === 0 ? (
          <div className="empty">배정된 SR이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SR번호</th><th>제목</th><th>담당 CI</th><th>상태</th><th>완료 예정</th></tr></thead>
              <tbody>
                {assigned.map((r) => (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td className="strong">{r.title}</td>
                    <td>{r.ci}</td>
                    <td><Chip tone={SR_CHIP[r.status]}>{srStatusLabel(r)}</Chip></td>
                    <td className="tnum">{r.dueDate ?? '-'}</td>
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
