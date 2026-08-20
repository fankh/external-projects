import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { currentYear, nowStampSec, today } from '@/lib/dates'
import { sendVia } from '@/lib/integrations/registry'
import { ACCOUNTS } from '@/lib/session'
import { getStore, isRemoteTargetIn, nextNo } from '@/lib/store'
import type { PledgeKind } from '@/lib/types'


function unsignedOf(s: ReturnType<typeof getStore>) {
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signed = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  return s.people.filter((p) => !signed.has(p.name))
}

/** 개정 후 재서약 대상(이름) — 유형별 의무자 중 현 개정본(revisedAt) 유효 서명이 없는 인원.
 *  의무자 집합은 pledge/my 의 각 유형 노출 조건과 동일: 일반=전 직원, 관리책임자=비-USER 계정,
 *  재택근무=당월 재택 대상자, 특별=보안담당자, 프로젝트=진행중 프로젝트 참여 인력. */
function reSignTargets(s: ReturnType<typeof getStore>, kind: PledgeKind, revisedAt: string): string[] {
  const missing = (name: string) => !s.pledges.some((p) => p.name === name && p.kind === kind && p.signedAt >= revisedAt)
  if (kind === '일반') return unsignedOf(s).map((p) => p.name)
  if (kind === '관리책임자') return ACCOUNTS.filter((a) => a.role !== 'USER').map((a) => a.name).filter(missing)
  if (kind === '재택근무') {
    const month = today().slice(0, 7)
    // 이름 중복 제거 — 한 사람이 인접한 두 재택 기간(경계월)으로 명단에 둘 잡히면(v1.5.53) 재서약 안내메일이
    // 중복 발송되고 sendLog to.length 가 부풀므로, 대상 산정에서 이름 기준 dedup 한다(할일은 line 63 에서 별도 dedup).
    // 재직자 교집합 — remoteTargets 는 s.people 과 별개 명단이고 syncHr 는 s.people 만 교체하므로, 재택
    // 대상자가 퇴사해 s.people 에서 빠져도 remoteTargets 엔 남아(재조정 경로 없음) 퇴사자에게 재서약 할일·
    // 안내메일이 나갔다('프로젝트' 분기와 동일 유령 대상 방지, 인사연동 감사 v1.5.90).
    return [...new Set(s.remoteTargets.filter((t) => isRemoteTargetIn(t, month)).map((t) => t.name))]
      .filter(missing).filter((name) => s.people.some((per) => per.name === name))
  }
  // 재직자 교집합 — securityOfficers 도 s.people 과 별개 명단이라 보안담당자 퇴사 시 유령 재서약 방지(위와 동일).
  if (kind === '특별') return s.securityOfficers.filter(missing).filter((name) => s.people.some((per) => per.name === name))
  if (kind === '프로젝트') {
    const members = new Set<string>()
    for (const pj of s.projects.filter((p) => p.status === '진행중')) for (const m of pj.members ?? []) members.add(m)
    // 참여 프로젝트 중 하나라도 현 개정본 미서명이면 대상. 단, 현재 재직자(s.people)만 — 실 고객사 HR
    // 어댑터가 퇴사자를 s.people 에서 제거해도 pj.members 는 그대로 남으므로(재조정 경로 없음), 재직 명단과
    // 교집합해 이미 떠난 인원에게 재서약 할일·안내메일이 나가는 유령 대상을 막는다.
    return [...members].filter((name) => s.people.some((per) => per.name === name) && s.projects.some((pj) =>
      pj.status === '진행중' && (pj.members ?? []).includes(name) &&
      !s.pledges.some((p) => p.name === name && p.kind === '프로젝트' && p.projectRef === pj.id && p.signedAt >= revisedAt)))
  }
  return []
}

/** 양식 개정 — 개정일자 이전 서약이 무효가 되어 전원 재서약 대상으로 재산출된다 (요구사항: 개정일 기준 안내) */
async function reviseForm(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/manage', 'BIZ_MGR', 'ADMIN')
  const kind = String(formData.get('kind') ?? '') as PledgeKind
  const s = getStore()
  const form = s.pledgeForms.find((f) => f.kind === kind)
  if (!form) return
  // 개정은 현재 시각(초 단위)으로 확정한다 — 같은 날 개정 이전에 한 서약도 무효화돼 재서약 대상이
  // 된다(날짜 단위 개정일자로는 당일 개정 전 서명이 유효로 남던 문제를 시각 단위로 해소).
  const revisedAt = nowStampSec()
  const day = revisedAt.slice(0, 10)
  audit(me.name, '서약양식 개정', `${kind} 보안서약서: ${form.revisedAt.slice(0, 10)} → ${revisedAt}`)
  form.revisedAt = revisedAt

  // 폐쇄 루프 — 유형 불문 재서약 대상에게 '보안서약서' 할일(유형 명시)과 안내메일이 나간다.
  // (기존엔 일반만 통지 — 관리책임자·재택·특별·프로젝트 개정은 서명 무효화만 되고 안내가 없었음)
  const targets = reSignTargets(s, kind, revisedAt)
  const year = day.slice(0, 4)
  for (const name of targets) {
    if (!s.todos.some((t) => t.owner === name && t.kind === '보안서약서' && t.title.includes(`${kind} 보안서약서`) && !t.done)) {
      s.todos.unshift({
        id: nextNo('TD', year, s.todos.map((t) => t.id)),
        owner: name, kind: '보안서약서', title: `${currentYear()}년 ${kind} 보안서약서 재서약 (개정 ${day})`,
        dueDate: day, done: false,
      })
    }
  }
  if (targets.length > 0) await sendVia('groupware-mail', targets, `[보안서약서] ${kind} 양식 개정(${day}) — 재서약 안내`)
  revalidatePath('/', 'layout')
}

/** 스캔본 업로드 — 그룹웨어 계정이 없는 재직자의 서면 서약을 대리 등록 (부서현황에 자동 반영) */
async function uploadScan(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/manage', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const s = getStore()
  const person = s.people.find((p) => p.name === name)
  if (!person || !unsignedOf(s).some((p) => p.name === name)) return
  s.pledges.push({ name: person.name, dept: person.dept, year: currentYear(), kind: '일반', signedAt: nowStampSec(), method: '서면(스캔)' })
  // 이력추적성(§VI) — 서면 서약 대리등록은 담당자가 타 재직자의 서약률(컴플라이언스 지표)을 올리는 대리 행위이고,
  // 서약 레코드에 등록자 필드가 없어 '누가 대리등록했나'의 유일 추적 지점이 감사 로그다(협력업체 서약 징구와 동일 정책).
  audit(me.name, '보안서약 대리등록', `${person.name}(${person.dept}) 서면(스캔) — ${currentYear()}년 일반 보안서약`)
  const todo = s.todos.find((t) => t.owner === name && t.kind === '보안서약서' && t.title.includes('일반 보안서약서') && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

/** 협력업체 서약 — 담당자가 징구·첨부해 등록하고, 선택 건을 결재 상신한다 (결재 시트 12번) */
async function addCompanyPledge(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/manage', 'BIZ_MGR', 'ADMIN')
  const company = String(formData.get('company') ?? '').trim().slice(0, 60)
  const personName = String(formData.get('personName') ?? '').trim().slice(0, 40)
  if (!company || !personName) return
  const s = getStore()
  // 이중 징구 방어 — 서버액션 폼 더블클릭 시 같은 협력업체 인원의 등록 건이 두 벌 생겨 결재상신 후보에 중복
  // 노출된다(addInfraChange·createSr 와 동일 클래스). 같은 업체·대상자의 미상신(등록) 건이 이미 있으면 무시.
  if (s.companyPledges.some((c) => c.company === company && c.personName === personName && c.status === '등록')) return
  const id = nextNo('CP', today().slice(0, 4), s.companyPledges.map((c) => c.id))
  s.companyPledges.unshift({ id, company, personName, registeredAt: today(), status: '등록' })
  // 이력추적성(§VI) — 협력업체 서약 징구는 타 주체(파트너사) 기록 등록이고 레코드에 징구자 필드가 없어(공유
  // 워크스페이스에서 상신자와 다를 수 있음), 감사 로그가 '누가 징구했나'의 유일 추적 지점(addViolation 과 동일 정책).
  audit(me.name, '협력업체 서약 징구', `${id} ${company} — ${personName}`)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/pledge/manage')
}

async function submitCompanyPledges(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/manage', 'BIZ_MGR', 'ADMIN')
  const ids = formData.getAll('ids').map(String)
  const s = getStore()
  const targets = s.companyPledges.filter((c) => ids.includes(c.id) && c.status === '등록')
  if (targets.length === 0) return
  const year = today().slice(0, 4)
  // 묶음 번호는 결재 이력에서 채번 — 행 approvalRef 는 반려 시 초기화되어 재사용 위험
  const ref = nextNo('CPB', year, s.approvals.filter((a) => a.docType === '서약 현황 상신' && a.ref).map((a) => a.ref!))
  for (const c of targets) {
    c.approvalRef = ref
    c.status = '결재중'
  }
  // 첨부는 결재 문서 본문에 목록으로 노출 (자동첨부 안 함 — 결재 시트 12번)
  draftApproval({ docType: '서약 현황 상신', title: `[보안서약서-협력업체] ${targets.length}건 (${targets.map((c) => c.company).join('·')})`, ref, drafter: me, items: targets.map((c) => c.id) })
  revalidatePath('/', 'layout')
}

async function toggleOfficer(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/manage', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const s = getStore()
  if (!s.people.some((p) => p.name === name)) return
  const wasOfficer = s.securityOfficers.includes(name)
  s.securityOfficers = wasOfficer
    ? s.securityOfficers.filter((n) => n !== name)
    : [...s.securityOfficers, name]
  // 이력추적성(§VI) — 보안담당자(특별서약 대상·보안 관리 책임) 지정/해제는 거버넌스 역할 배정이고
  // securityOfficers 는 이름 배열이라 행위자 필드가 없어 감사 로그가 유일 추적점(재택 대상자 변경과 동일 정책).
  audit(me.name, '보안담당자 지정', `${name} ${wasOfficer ? '해제' : '지정'}`)
  revalidatePath('/pledge/manage')
}

export default async function ManagePledgePage() {
  await requireMenu('/pledge/manage')
  const s = getStore()
  const unsigned = unsignedOf(s)
  // 100% 는 전원 서약일 때만 — Math.round 는 99.5% 를 100 으로 올려 미서약자가 남은 서약 컴플라이언스를
  // 거짓 완주로 보이게 한다(교육 이수율 v1.5.79 와 동일 governance 오신호). 미서약이 있으면 99 로 캡.
  const rate = s.people.length ? (unsigned.length === 0 ? 100 : Math.min(99, Math.round(((s.people.length - unsigned.length) / s.people.length) * 100))) : 0

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="전사 현황 · 양식관리"
        desc="전사 서약 진행현황과 서약서 양식(개정일자), 보안담당자, 서면 스캔본 등록을 관리한다." />

      <div className="stat-row">
        <Stat value={s.people.length} label="전사 대상" />
        <Stat value={`${rate}%`} label="서약률" tone={rate < 100 ? 'warn' : undefined} />
        <Stat value={unsigned.length} label="미서약" tone={unsigned.length > 0 ? 'err' : undefined} />
        <Stat value={s.securityOfficers.filter((n) => s.people.some((p) => p.name === n)).length} label="보안담당자" note="특별서약 대상" />
      </div>

      <div className="cols c2">
        <Card title="양식관리 — 개정일자" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>서약서 양식</th><th>개정일자</th><th className="c">개정</th></tr></thead>
              <tbody>
                {s.pledgeForms.map((f) => (
                  <tr key={f.kind}>
                    <td className="strong">{f.kind} 보안서약서 <span className="mut">(온라인)</span></td>
                    <td className="tnum">{f.revisedAt.slice(0, 10)}</td>
                    <td className="c">
                      {/* 개정은 현재 시각으로 확정된다(당일 개정 전 서명도 무효화) — 날짜 입력 없이 즉시 개정 */}
                      <form action={reviseForm} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                        <input type="hidden" name="kind" value={f.kind} />
                        <button type="submit" className="btn sm">개정 (현재 시각)</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dim" style={{ fontSize: 11.5, padding: '8px 14px' }}>
            일반 서약서 개정 시 개정일 이전 서약은 무효가 되어 전원 재서약 대상으로 재산출되고,
            할일 생성·안내메일 발송이 자동으로 실행된다.
          </div>
        </Card>

        <Card title="미서약자 — 스캔본 업로드" pad={false}>
          {unsigned.length === 0 ? (
            <div className="empty">미서약자가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>이름</th><th>부서</th><th className="c">서면 서약 등록</th></tr></thead>
                <tbody>
                  {unsigned.map((p) => (
                    <tr key={p.name}>
                      <td className="strong">{p.name}</td>
                      <td>{p.dept}</td>
                      <td className="c">
                        <form action={uploadScan} style={{ display: 'inline' }}>
                          <input type="hidden" name="name" value={p.name} />
                          <button type="submit" className="btn sm">스캔본 업로드</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="협력업체 서약서 — 징구·상신" pad={false}>
        <form action={submitCompanyPledges}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th className="c">선택</th><th>번호</th><th>업체</th><th>대상자</th><th>등록일</th><th>상태</th></tr></thead>
              <tbody>
                {s.companyPledges.map((c) => (
                  <tr key={c.id}>
                    <td className="c">
                      {c.status === '등록' ? <input aria-label="선택" type="checkbox" name="ids" value={c.id} /> : <span className="mut">-</span>}
                    </td>
                    <td className="code">{c.id}</td>
                    <td className="strong">{c.company}<Clip count={attachCount(c.id)} title="서약서 첨부" /></td>
                    <td>{c.personName}</td>
                    <td className="tnum">{c.registeredAt}</td>
                    <td>
                      {c.status === '완료' ? <Chip tone="ok">완료</Chip> :
                       c.status === '결재중' ? <Chip tone="info">결재중</Chip> : <Chip tone="neutral">등록</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hstack" style={{ borderTop: '1px solid var(--line)', padding: '9px 14px', justifyContent: 'space-between' }}>
            <span className="dim" style={{ fontSize: 11.5 }}>결재진행·완료 건은 선택할 수 없다 — 첨부는 결재 본문에 목록으로 노출.</span>
            <button type="submit" className="btn pri" disabled={!s.companyPledges.some((c) => c.status === '등록')}>선택 건 결재상신</button>
          </div>
        </form>
        <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
          <form action={addCompanyPledge} className="hstack">
            <input aria-label="협력업체명" className="input" name="company" required maxLength={60} placeholder="협력업체명" style={{ width: 160 }} />
            <input aria-label="대상자 성명" className="input" name="personName" required maxLength={40} placeholder="대상자 성명" style={{ width: 120 }} />
            <input className="input" type="file" name="file" style={{ flex: 1, paddingTop: 4 }} title="서약서·준법신청서약서 첨부" />
            <button type="submit" className="btn">징구 등록</button>
          </form>
        </div>
      </Card>

      <Card title="보안담당자 관리" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>부서</th><th>보안담당자</th><th className="c">지정 · 해제</th></tr></thead>
            <tbody>
              {s.people.map((p) => {
                const isOfficer = s.securityOfficers.includes(p.name)
                return (
                  <tr key={p.name}>
                    <td className="strong">{p.name}</td>
                    <td>{p.dept}</td>
                    <td>{isOfficer ? <Chip tone="info">보안담당자</Chip> : <span className="mut">-</span>}</td>
                    <td className="c">
                      <form action={toggleOfficer} style={{ display: 'inline' }}>
                        <input type="hidden" name="name" value={p.name} />
                        <button type="submit" className={`btn sm ${isOfficer ? 'danger' : ''}`}>{isOfficer ? '해제' : '지정'}</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="dim" style={{ fontSize: 11.5, padding: '8px 14px' }}>
          일반서약서 동의 후 특별서약서 대상자로 관리된다 — 보안담당자는 보안서약서 제출 화면에서 담당업무·세부업무내용을 추가 입력해 특별서약을 제출한다.
        </div>
      </Card>
    </>
  )
}
