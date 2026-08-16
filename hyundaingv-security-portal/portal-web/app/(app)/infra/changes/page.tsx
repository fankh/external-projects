import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerGenerated, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'
import type { ChangeStatus } from '@/lib/types'

const ST_CHIP: Record<ChangeStatus, 'neutral' | 'info' | 'warn' | 'ok'> = {
  작업등록: 'neutral', 계획결재중: 'info', 작업등록승인: 'warn', 작업완료결재중: 'info', 최종완료: 'ok',
}

/** 변경 재상신 시 반려 재상신 할일을 닫는다 — 변경은 공유 워크스페이스(담당·Admin)라 재상신자가
 *  원 기안자와 다를 수 있고, 그때 draftApproval 의 기안자-매칭 닫기가 놓쳐 고아 할일 + 방치 알림이
 *  무한 반복된다. 유형+변경번호(제목 선두 고정)로 소유자 무관하게 닫아 SR 재상신(requester 바인딩
 *  자가치유)과 동등한 폐쇄 루프를 만든다. */
function closeChangeResignTodo(s: ReturnType<typeof getStore>, docType: string, cwId: string) {
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[${docType}] ${cwId} `)) t.done = true
  }
}

async function addInfraChange(formData: FormData) {
  'use server'
  await requireMenuRole('/infra/changes', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const plan = String(formData.get('plan') ?? '').trim().slice(0, 500)
  // 원복계획 — 작업계획과 별개의 필수 산출물 (요구사항: "작업계획, 원복계획 필요")
  const rollbackPlan = String(formData.get('rollbackPlan') ?? '').trim().slice(0, 500)
  if (!title || !plan || !rollbackPlan) return
  const s = getStore()
  // 이중 등록 방어 — 서버액션 폼은 제출 후 자동 비활성화되지 않아 더블클릭으로 같은 변경이 두 벌 생긴다
  // (createSr·receiveCiSr 와 동일 클래스). 같은 제목의 미상신(작업등록) 인프라 변경이 이미 있으면 직전 제출의 중복으로 무시.
  if (s.changes.some((c) => c.kind === '인프라' && c.title === title && c.status === '작업등록')) return
  s.changes.unshift({
    id: nextNo('CW', today().slice(0, 4), s.changes.map((c) => c.id)),
    kind: '인프라', title, plan, rollbackPlan, status: '작업등록', registeredAt: today(),
  })
  revalidatePath('/infra/changes')
}

async function addDevChange(formData: FormData) {
  'use server'
  await requireMenuRole('/infra/changes', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === '적용요청')
  if (!sr || s.changes.some((c) => c.srNo === srNo)) return
  // 폐쇄 루프 — SR 적용요청 건이 변경 목록으로 편입된다 (요구사항: 적용요청 결재완료건 바로 목록 추가)
  s.changes.unshift({
    id: nextNo('CW', today().slice(0, 4), s.changes.map((c) => c.id)),
    kind: '시스템개발', title: `[${sr.system}] ${sr.title}`, srNo, status: '작업등록', registeredAt: today(),
    plan: `SR ${srNo} 운영계 반영`,
  })
  revalidatePath('/infra/changes')
}

async function submitPlan(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/changes', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const cw = s.changes.find((c) => c.id === id && c.status === '작업등록')
  if (!cw) return
  cw.status = '계획결재중'
  // 엑셀양식(XT) 자동첨부 — 요구사항 결재 시트 9·10번 '첨부파일자동생성 o'
  registerGenerated(cw.id, '변경계획 상신', me.name)
  draftApproval({ docType: '변경계획 상신', title: `[${cw.kind}변경] ${cw.title} — 작업계획`, ref: cw.id, drafter: me })
  closeChangeResignTodo(s, '변경계획 상신', cw.id)
  revalidatePath('/', 'layout')
}

async function submitResult(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/changes', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const result = String(formData.get('result') ?? '').trim().slice(0, 500)
  if (!result) return
  const s = getStore()
  const cw = s.changes.find((c) => c.id === id && c.status === '작업등록승인')
  if (!cw) return
  cw.result = result
  cw.status = '작업완료결재중'
  // 작업결과 증적 — 공통 첨부(cw.id)로 묶여 결재함에서도 보인다 (첨부 시트: modifications)
  registerUpload(cw.id, formData.get('file'), me.name)
  // 엑셀양식(XT) 자동첨부 — 요구사항 결재 시트 9·10번 '첨부파일자동생성 o'
  registerGenerated(cw.id, '변경결과 상신', me.name)
  draftApproval({ docType: '변경결과 상신', title: `[${cw.kind}변경] ${cw.title} — 작업결과`, ref: cw.id, drafter: me })
  closeChangeResignTodo(s, '변경결과 상신', cw.id)
  revalidatePath('/', 'layout')
}

export default async function ChangesPage() {
  await requireMenu('/infra/changes')
  const s = getStore()

  const matchable = s.srRequests.filter((r) => r.status === '적용요청' && !s.changes.some((c) => c.srNo === r.srNo))
  const inflight = s.changes.filter((c) => c.status !== '최종완료')

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="변경관리"
        desc="인프라·시스템개발 변경 — 계획 상신과 결과 상신을 각 1회 거치며, 시스템개발 변경 최종완료는 매칭 SR을 완료로 전파한다." />

      <div className="stat-row">
        <Stat value={inflight.length} label="진행중 변경" tone={inflight.length > 0 ? 'warn' : undefined} />
        <Stat value={s.changes.filter((c) => c.status === '계획결재중' || c.status === '작업완료결재중').length} label="결재중" />
        <Stat value={matchable.length} label="편입 대기 SR" note="적용요청 결재완료" tone={matchable.length > 0 ? 'warn' : undefined} />
        <Stat value={s.changes.filter((c) => c.status === '최종완료').length} label="최종완료" />
      </div>

      <Card title="변경 작업 목록" kicker="Change Works" pad={false}
        actions={<a className="btn sm" href="/api/export?type=changes">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>번호</th><th>구분</th><th>제목</th><th>작업 · 원복계획</th><th>매칭 SR</th><th>상태</th><th>등록일</th><th className="c">처리</th></tr>
            </thead>
            <tbody>
              {s.changes.map((c) => (
                <tr key={c.id}>
                  <td className="code">{c.id}</td>
                  <td><Chip tone={c.kind === '인프라' ? 'info' : 'neutral'} bare>{c.kind}</Chip></td>
                  <td className="strong">{c.title}<Clip count={attachCount(c.id)} title="작업 증적" /></td>
                  <td style={{ maxWidth: 240, fontSize: 11.5 }}>
                    {c.plan ? <div title="작업계획">{c.plan}</div> : <span className="mut">-</span>}
                    {c.rollbackPlan && <div className="mut" title="원복계획" style={{ marginTop: 2 }}>↩ {c.rollbackPlan}</div>}
                  </td>
                  <td>{c.srNo ? <span className="mono">{c.srNo}</span> : <span className="mut">-</span>}</td>
                  <td><Chip tone={ST_CHIP[c.status]}>{c.status}</Chip></td>
                  <td className="tnum">{c.registeredAt}</td>
                  <td className="c" style={{ maxWidth: 420 }}>
                    {c.status === '작업등록' && (
                      <form action={submitPlan} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="btn sm pri">계획 상신</button>
                      </form>
                    )}
                    {c.status === '작업등록승인' && (
                      <form action={submitResult} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                        <input type="hidden" name="id" value={c.id} />
                        <input aria-label="작업 결과" className="input" name="result" required maxLength={500} placeholder="작업 결과" style={{ height: 25, fontSize: 11.5, width: 170 }} />
                        <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 150, paddingTop: 2 }} title="결과 증적 첨부" />
                        <button type="submit" className="btn sm pri">결과 상신</button>
                      </form>
                    )}
                    {(c.status === '계획결재중' || c.status === '작업완료결재중') && <span className="mut">결재 대기</span>}
                    {c.status === '최종완료' && <span className="mut">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="인프라변경 등록" kicker="Infra Change">
          <form action={addInfraChange} className="vstack" style={{ gap: 7 }}>
            <input aria-label="변경 작업 제목" className="input" name="title" required maxLength={120} placeholder="변경 작업 제목" />
            <input aria-label="작업계획" className="input" name="plan" required maxLength={500} placeholder="작업계획 (작업 내용·절차)" />
            <div className="hstack">
              <input aria-label="원복계획" className="input" name="rollbackPlan" required maxLength={500} placeholder="원복계획 (실패 시 되돌림 절차)" style={{ flex: 1 }} />
              <button type="submit" className="btn">등록</button>
            </div>
          </form>
        </Card>

        <Card title="시스템개발변경 등록 — SR 편입" kicker="Dev Change">
          {matchable.length === 0 ? (
            <div className="empty" style={{ padding: '12px 0' }}>편입 대기 중인 적용요청 SR이 없습니다.</div>
          ) : (
            <form action={addDevChange} className="hstack">
              <select aria-label="SR번호" className="select" name="srNo" required style={{ flex: 1 }}>
                {matchable.map((r) => <option key={r.srNo} value={r.srNo}>{r.srNo} · {r.title}</option>)}
              </select>
              <button type="submit" className="btn">변경 작업 편입</button>
            </form>
          )}
          <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
            적용요청 상태의 SR만 편입된다. 변경 최종완료 시 SR이 완료로 전파된다.
          </div>
        </Card>
      </div>
    </>
  )
}
