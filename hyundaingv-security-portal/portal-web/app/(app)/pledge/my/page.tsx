import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { currentYear, nowStampSec } from '@/lib/dates'
import { getStore } from '@/lib/store'


const CLAUSES = [
  '회사의 정보자산(시스템·데이터·문서)을 업무 목적 외로 사용하거나 외부에 유출하지 않는다.',
  '계정과 비밀번호를 타인과 공유하지 않으며, 이상 징후 인지 시 즉시 보안담당자에게 보고한다.',
  '개인정보와 영업비밀을 관련 법령 및 사내 규정에 따라 취급하고, 퇴직 시 일체를 반납·파기한다.',
  '보안 규정 위반 시 관련 법령 및 사규에 따른 책임을 진다.',
]

/** 개정일자 이후 서약만 유효 — 양식이 개정되면 기존 서약은 무효가 되어 재서약 대상이 된다 */
function validSign(s: ReturnType<typeof getStore>, name: string) {
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  return s.pledges.find((p) => p.name === name && p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt)
}

async function sign(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/my', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  if (formData.get('agree') !== 'on') return
  const s = getStore()
  if (validSign(s, me.name)) return

  s.pledges.push({ name: me.name, dept: me.dept, year: currentYear(), kind: '일반', signedAt: nowStampSec(), method: '온라인' })

  // 폐쇄 루프 — 제출과 함께 해당 유형 '보안서약서' 할일이 닫히고 집계가 갱신된다 (유형별로 닫아 교차마감 방지)
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '보안서약서' && t.title.includes('일반 보안서약서') && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

/** 관리책임자·재택근무 서약 — 요구사항 45행: 관리자와 일반이 구분된 서약서, 재택근무자 보안서약서.
 *  관리책임자는 관리자 권한(부서담당 이상)만 서버에서 재검증한다. */
async function signKind(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/my', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const raw = String(formData.get('kind') ?? '')
  const kind = raw === '관리책임자' || raw === '재택근무' ? raw : null
  if (!kind || formData.get('agree') !== 'on') return
  if (kind === '관리책임자' && me.role === 'USER') return
  const s = getStore()
  const revisedAt = s.pledgeForms.find((f) => f.kind === kind)?.revisedAt ?? '0000-00-00'
  if (s.pledges.some((p) => p.name === me.name && p.year === currentYear() && p.kind === kind && p.signedAt >= revisedAt)) return
  s.pledges.push({ name: me.name, dept: me.dept, year: currentYear(), kind, signedAt: nowStampSec(), method: '온라인' })
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '보안서약서' && t.title.includes(`${kind} 보안서약서`) && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

/** 프로젝트 참여 서약 — 사내인력이 참여 프로젝트를 지정해 동의한다 (요구사항 46행). */
async function signProject(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/my', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const projectRef = String(formData.get('projectRef') ?? '')
  if (formData.get('agree') !== 'on') return
  const s = getStore()
  const pj = s.projects.find((p) => p.id === projectRef && p.status === '진행중')
  // 투입 인력 명단이 있으면 명단 인원만 서약 대상 (명단 없는 구건은 전원 허용). 빈 명단([])은 미지정과
  // 동일 취급 — 옵셔널 members 가 영속화·재로딩에서 undefined→[] 로 정규화돼도(빈 배열 truthy) 전원이
  // 서명 차단되지 않도록 length 로 판정한다.
  if (!pj || (pj.members && pj.members.length > 0 && !pj.members.includes(me.name))) return
  const revisedAt = s.pledgeForms.find((f) => f.kind === '프로젝트')?.revisedAt ?? '0000-00-00'
  if (s.pledges.some((p) => p.name === me.name && p.kind === '프로젝트' && p.projectRef === projectRef && p.signedAt >= revisedAt)) return
  s.pledges.push({ name: me.name, dept: me.dept, year: currentYear(), kind: '프로젝트', signedAt: nowStampSec(), method: '온라인', projectRef })
  // 참여 프로젝트를 모두 서명했으면 재서약 할일을 닫는다 (남은 미서명 프로젝트가 있으면 유지)
  const remaining = s.projects.some((p) => p.status === '진행중' && (p.members ?? []).includes(me.name) &&
    !s.pledges.some((x) => x.name === me.name && x.kind === '프로젝트' && x.projectRef === p.id && x.signedAt >= revisedAt))
  if (!remaining) {
    const todo = s.todos.find((t) => t.owner === me.name && t.kind === '보안서약서' && t.title.includes('프로젝트 보안서약서') && !t.done)
    if (todo) todo.done = true
  }
  revalidatePath('/', 'layout')
}

/** 특별서약(보안담당자) — 일반서약 동의 후 대상. 담당업무·세부업무내용을 추가 입력한다. */
async function signSpecial(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/my', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const duty = String(formData.get('duty') ?? '').trim().slice(0, 200)
  if (formData.get('agree') !== 'on' || !duty) return
  const s = getStore()
  if (!s.securityOfficers.includes(me.name) || !validSign(s, me.name)) return
  const revisedAt = s.pledgeForms.find((f) => f.kind === '특별')?.revisedAt ?? '0000-00-00'
  if (s.pledges.some((p) => p.name === me.name && p.year === currentYear() && p.kind === '특별' && p.signedAt >= revisedAt)) return
  s.pledges.push({ name: me.name, dept: me.dept, year: currentYear(), kind: '특별', signedAt: nowStampSec(), method: '온라인', duty })
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '보안서약서' && t.title.includes('특별 보안서약서') && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

export default async function MyPledgePage() {
  const me = await requireMenu('/pledge/my')
  const s = getStore()
  const REVISION = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '-'
  const mine = s.pledges.filter((p) => p.name === me.name)
  const signed = validSign(s, me.name)

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="보안서약서 제출"
        desc={`${currentYear()}년 일반 보안서약서 (개정 ${REVISION.slice(0, 10)})`}
        right={signed
          ? <Chip tone="ok">제출 완료 · {signed.signedAt.slice(0, 10)}</Chip>
          : <Chip tone="err">미제출</Chip>} />

      <Card title={`${currentYear()}년 일반 보안서약서`} kicker={`양식 개정일자 ${REVISION.slice(0, 10)}`}>
        <p className="dim" style={{ marginBottom: 8 }}>
          본인({me.dept} {me.name})은 회사의 정보보호 규정을 숙지하였으며, 아래 사항을 준수할 것을 서약합니다.
        </p>
        <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CLAUSES.map((c) => <li key={c}>{c}</li>)}
        </ol>
      </Card>

      {signed ? (
        <div className="callout">
          <b>제출 완료</b> — {signed.signedAt.slice(0, 10)} {signed.method} 제출. 양식 개정 또는 복직 시 재서약 대상이 되면
          나의 할일에 다시 표시됩니다.
        </div>
      ) : (
        <Card title="온라인 동의">
          <form action={sign} className="hstack" style={{ justifyContent: 'space-between' }}>
            <label className="hstack" style={{ gap: 7, cursor: 'pointer' }}>
              <input aria-label="동의" type="checkbox" name="agree" required />
              위 서약 내용을 모두 확인하였으며 이에 동의합니다.
            </label>
            <button type="submit" className="btn pri">서약서 제출</button>
          </form>
        </Card>
      )}

      {/* 요구사항 45행 — 관리자와 일반이 구분된 서약서: 관리자(부서담당 이상)는 관리책임자 서약을 추가 제출한다 */}
      {me.role !== 'USER' && (() => {
        const revised = s.pledgeForms.find((f) => f.kind === '관리책임자')?.revisedAt ?? '0000-00-00'
        const done = s.pledges.find((p) => p.name === me.name && p.year === currentYear() && p.kind === '관리책임자' && p.signedAt >= revised)
        return (
          <Card title="관리책임자 보안서약서" kicker={`양식 개정일자 ${revised.slice(0, 10)}`}>
            {done ? (
              <Chip tone="ok">제출 완료 · {done.signedAt.slice(0, 10)}</Chip>
            ) : (
              <form action={signKind} className="hstack" style={{ justifyContent: 'space-between' }}>
                <input type="hidden" name="kind" value="관리책임자" />
                <label className="hstack" style={{ gap: 7, cursor: 'pointer' }}>
                  <input aria-label="동의" type="checkbox" name="agree" required />
                  관리책임자로서 소관 조직의 정보보호 관리 책임을 다할 것을 서약합니다.
                </label>
                <button type="submit" className="btn pri">관리책임자 서약 제출</button>
              </form>
            )}
          </Card>
        )
      })()}

      {/* 요구사항 45행 — 재택근무보안서약서: 재택근무자는 재택 서약을 추가 제출한다 (체크리스트와 별개) */}
      {(() => {
        const revised = s.pledgeForms.find((f) => f.kind === '재택근무')?.revisedAt ?? '0000-00-00'
        const done = s.pledges.find((p) => p.name === me.name && p.year === currentYear() && p.kind === '재택근무' && p.signedAt >= revised)
        return (
          <Card title="재택근무 보안서약서" kicker={`양식 개정일자 ${revised.slice(0, 10)}`}>
            {done ? (
              <Chip tone="ok">제출 완료 · {done.signedAt.slice(0, 10)}</Chip>
            ) : (
              <form action={signKind} className="hstack" style={{ justifyContent: 'space-between' }}>
                <input type="hidden" name="kind" value="재택근무" />
                <label className="hstack" style={{ gap: 7, cursor: 'pointer' }}>
                  <input aria-label="동의" type="checkbox" name="agree" required />
                  재택근무 시 보안수칙(사내망 접속·자료 반출 금지·화면 잠금)을 준수할 것을 서약합니다.
                </label>
                <button type="submit" className="btn pri">재택근무 서약 제출</button>
              </form>
            )}
          </Card>
        )
      })()}

      {/* 요구사항 46행 — 특별서약서(프로젝트): 참여 프로젝트를 지정해 동의한다 */}
      {(() => {
        const active = s.projects.filter((p) => p.status === '진행중' && (!p.members || p.members.includes(me.name)))
        const pjRevised = s.pledgeForms.find((f) => f.kind === '프로젝트')?.revisedAt ?? '0000-00-00'
        const mySigns = s.pledges.filter((p) => p.name === me.name && p.kind === '프로젝트' && p.signedAt >= pjRevised)
        const unsignedProjects = active.filter((p) => !mySigns.some((x) => x.projectRef === p.id))
        return (
          <Card title="특별서약서 — 프로젝트 참여" kicker={`양식 개정일자 ${pjRevised.slice(0, 10)}`}>
            {mySigns.length > 0 && (
              <div className="hstack" style={{ flexWrap: 'wrap', marginBottom: unsignedProjects.length > 0 ? 8 : 0 }}>
                {mySigns.map((x) => {
                  const pj = s.projects.find((p) => p.id === x.projectRef)
                  return <Chip key={x.projectRef} tone="ok">{pj?.title ?? x.projectRef} · {x.signedAt.slice(0, 10)}</Chip>
                })}
              </div>
            )}
            {unsignedProjects.length === 0 ? (
              mySigns.length === 0 && <div className="dim" style={{ fontSize: 11.5 }}>진행중인 프로젝트가 없거나 전부 서약을 마쳤습니다.</div>
            ) : (
              <form action={signProject} className="hstack">
                <select aria-label="프로젝트" className="select" name="projectRef" required style={{ flex: 1 }}>
                  {unsignedProjects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
                </select>
                <label className="hstack" style={{ gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input aria-label="동의" type="checkbox" name="agree" required /> 참여 보안수칙 동의
                </label>
                <button type="submit" className="btn pri">프로젝트 서약 제출</button>
              </form>
            )}
          </Card>
        )
      })()}

      {s.securityOfficers.includes(me.name) && signed && (() => {
        const spRevised = s.pledgeForms.find((f) => f.kind === '특별')?.revisedAt ?? '0000-00-00'
        const special = s.pledges.find((p) => p.name === me.name && p.year === currentYear() && p.kind === '특별' && p.signedAt >= spRevised)
        return (
          <Card title="특별서약서 — 보안담당자" kicker={`양식 개정일자 ${spRevised.slice(0, 10)}`}>
            {special ? (
              <div className="hstack">
                <Chip tone="ok">제출 완료 · {special.signedAt.slice(0, 10)}</Chip>
                <span className="dim">담당업무: {special.duty}</span>
              </div>
            ) : (
              <>
                <p className="dim" style={{ marginBottom: 8 }}>
                  보안담당자로 지정되어 특별서약 대상입니다 — 본문 서약 외 담당업무·세부업무내용을 추가 입력합니다.
                </p>
                <form action={signSpecial} className="hstack">
                  <input aria-label="담당업무 · 세부업무내용" className="input" name="duty" required maxLength={200} placeholder="담당업무 · 세부업무내용" style={{ flex: 1 }} />
                  <label className="hstack" style={{ gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input aria-label="동의" type="checkbox" name="agree" required /> 동의
                  </label>
                  <button type="submit" className="btn pri">특별서약 제출</button>
                </form>
              </>
            )}
          </Card>
        )
      })()}

      <Card title="내 서약 이력" pad={false}>
        {mine.length === 0 ? (
          <div className="empty">제출한 서약서가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>연도</th><th>구분</th><th>제출일</th><th>방식</th></tr></thead>
              <tbody>
                {mine.map((p) => (
                  <tr key={`${p.year}-${p.kind}-${p.projectRef ?? ''}`}>
                    <td className="tnum">{p.year}</td>
                    <td>
                      <Chip tone="neutral" bare>{p.kind}</Chip>
                      {p.projectRef && <span className="mut" style={{ marginLeft: 5 }}>{s.projects.find((x) => x.id === p.projectRef)?.title ?? p.projectRef}</span>}
                    </td>
                    <td className="tnum">{p.signedAt.slice(0, 10)}</td>
                    <td>{p.method}</td>
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
