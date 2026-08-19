import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { computePolicyKpis, isReviewOverdue, nextReviewDue } from '@/lib/policy'
import { getStore, nextNo } from '@/lib/store'
import { POLICY_CATEGORIES } from '@/lib/types'
import type { PolicyCategory } from '@/lib/types'

const ST_CHIP = { 시행: 'ok', 개정중: 'warn', 폐지: 'neutral' } as const
// 재검토 주기 선택지 — 반기·연1회·격년·3년 (ISMS 는 통상 연 1회 이상)
const CYCLES: [number, string][] = [[6, '반기'], [12, '연 1회'], [24, '격년'], [36, '3년']]

async function addPolicy(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const category = String(formData.get('category') ?? '') as PolicyCategory
  const version = String(formData.get('version') ?? '').trim().slice(0, 20) || 'v1.0'
  const cycle = Number(formData.get('cycle'))
  const effectiveAt = String(formData.get('effectiveAt') ?? '')
  const s = getStore()
  const owner = String(formData.get('owner') ?? '')
  // 담당은 실존 인원만, 분류는 코드 집합만, 주기는 허용값만 (임의 POST 대비 — 다른 화면 select 검증과 동일)
  if (!title || !POLICY_CATEGORIES.includes(category) || !s.people.some((p) => p.name === owner)
    || !CYCLES.some(([m]) => m === cycle) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveAt)) return
  const id = nextNo('PL', today().slice(0, 4), s.securityPolicies.map((p) => p.id))
  // 등록 시 최근검토일=시행일(막 제정·검토 완료) — nextReviewDue 기준. 신규는 항상 '시행'.
  s.securityPolicies.unshift({ id, title, category, version, owner, status: '시행', effectiveAt, reviewCycleMonths: cycle, lastReviewedAt: effectiveAt })
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '정책 등록', `${id} ${title} (${category} ${version}) — 시행 ${effectiveAt} · 재검토 ${cycle}개월`)
  revalidatePath('/compliance/policies')
}

/** 재검토 완료 — 시행 정책을 재검토(내용 유효성 확인)하고 최근검토일을 갱신해 재검토 시계를 리셋한다(버전 불변). */
async function reviewPolicy(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const p = s.securityPolicies.find((x) => x.id === id && x.status === '시행')
  if (!p) return
  p.lastReviewedAt = today()
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '정책 변경', `${id} ${p.title} — 재검토 완료(${today()}), 재검토 예정 ${nextReviewDue(p)}`)
  revalidatePath('/compliance/policies')
}

/** 개정 착수 — 시행 정책을 개정중으로 전환(개정 작업 시작). 개정중은 재검토 경과 집계에서 제외된다. */
async function reviseStart(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const p = s.securityPolicies.find((x) => x.id === id && x.status === '시행')
  if (!p) return
  p.status = '개정중'
  audit(me.name, '정책 변경', `${id} ${p.title} — 개정 착수`)
  revalidatePath('/compliance/policies')
}

/** 개정 완료 — 개정중 정책을 신 버전으로 시행. 시행일·최근검토일을 갱신(개정=재검토 포함). */
async function reviseComplete(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const version = String(formData.get('version') ?? '').trim().slice(0, 20)
  const s = getStore()
  const p = s.securityPolicies.find((x) => x.id === id && x.status === '개정중')
  if (!p || !version) return
  p.version = version
  p.status = '시행'
  p.effectiveAt = today()
  p.lastReviewedAt = today()
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '정책 변경', `${id} ${p.title} — 개정 완료 ${version} 시행(${today()})`)
  revalidatePath('/compliance/policies')
}

async function retirePolicy(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const p = s.securityPolicies.find((x) => x.id === id && x.status !== '폐지')
  if (!p) return
  p.status = '폐지'
  audit(me.name, '정책 변경', `${id} ${p.title} — 폐지`)
  revalidatePath('/compliance/policies')
}

async function deletePolicy(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/policies', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const p = s.securityPolicies.find((x) => x.id === id)
  // 폐지된 정책만 삭제 — 시행·개정중 정책은 폐지로 처리하지 삭제로 없애지 않는다(ISMS 문서 이력 보존,
  // deleteRisk·updateProgress 상태 가드 계열). 화면은 폐지 건에만 삭제 버튼을 노출하나 서버에서도 가드한다.
  if (!p || p.status !== '폐지') return
  s.securityPolicies = s.securityPolicies.filter((x) => x.id !== id)
  s.attachments = s.attachments.filter((a) => a.refId !== id)
  audit(me.name, '정책 삭제', `${id} ${p.title} (${p.category})`)
  revalidatePath('/compliance/policies')
}

export default async function PoliciesPage() {
  const me = await requireMenu('/compliance/policies')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const t = today()
  // 재검토 경과·개정중 우선 → 시행 → 폐지 순, 동급이면 재검토 예정일 빠른 순 (우선 처리 대상 상단).
  const order = (p: (typeof s.securityPolicies)[number]) => (isReviewOverdue(p, t) ? 0 : p.status === '개정중' ? 1 : p.status === '시행' ? 2 : 3)
  const rows = [...s.securityPolicies].sort((a, b) => order(a) - order(b) || nextReviewDue(a).localeCompare(nextReviewDue(b)))
  const k = computePolicyKpis(s.securityPolicies, t)

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="정책·지침 관리"
        desc="정보보호 정책·지침·절차 문서를 버전·시행일·재검토 주기로 관리한다 — 재검토 예정일 경과를 추적해 주기적 재검토(ISMS 관리체계 1.1)를 강제한다." />

      <div className="stat-row">
        <Stat value={k.total} label="전체 정책" note={`시행 ${k.active} · 개정중 ${k.revising}`} />
        <Stat value={k.overdue} label="재검토 경과" tone={k.overdue > 0 ? 'err' : undefined} note="시행중 · 예정일 초과" />
        <Stat value={k.revising} label="개정중" tone={k.revising > 0 ? 'warn' : undefined} />
        <Stat value={s.securityPolicies.filter((p) => p.status === '폐지').length} label="폐지" />
      </div>

      {canManage && (
        <Card title="정책 등록" kicker="New Policy">
          <form action={addPolicy} className="hstack">
            <select aria-label="분류" className="select" name="category">{POLICY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input aria-label="제목" className="input" name="title" required maxLength={120} placeholder="정책·지침 제목" style={{ flex: 1 }} />
            <input aria-label="버전" className="input" name="version" maxLength={20} placeholder="버전(v1.0)" defaultValue="v1.0" style={{ width: 90 }} />
            <select aria-label="담당" className="select" name="owner">{s.people.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.dept})</option>)}</select>
            <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>재검토
              <select aria-label="재검토 주기" className="select" name="cycle" defaultValue={12}>{CYCLES.map(([m, lbl]) => <option key={m} value={m}>{lbl}</option>)}</select>
            </label>
            <input aria-label="시행일" className="input" type="date" name="effectiveAt" required defaultValue={t} style={{ width: 150 }} />
            <input className="input" type="file" name="file" style={{ width: 130, paddingTop: 4 }} title="정책 문서 첨부" />
            <button type="submit" className="btn pri">등록</button>
          </form>
        </Card>
      )}

      <Card title="정책·지침 관리대장" kicker="Policy Register" pad={false}
        actions={<a className="btn sm" href="/api/export?type=policies">엑셀 다운로드</a>}>
        {rows.length === 0 ? (
          <div className="empty">등록된 정책·지침이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>제목 · 분류</th><th>버전</th><th>담당</th><th>시행일</th><th>재검토 예정</th><th>상태</th>{canManage && <th className="c">처리</th>}</tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const due = nextReviewDue(p)
                  const overdue = isReviewOverdue(p, t)
                  return (
                    <tr key={p.id}>
                      <td className="code">{p.id}</td>
                      <td className="strong">{p.title}<Clip count={attachCount(p.id)} title="정책 문서" /><span className="mut" style={{ display: 'block', fontSize: 11 }}>{p.category}</span></td>
                      <td className="tnum">{p.version}</td>
                      <td>{p.owner}</td>
                      <td className="tnum">{p.effectiveAt}</td>
                      <td className="tnum">{p.status === '폐지' ? <span className="mut">-</span> : <>{due}{overdue && <Chip tone="err" bare>경과</Chip>}</>}</td>
                      <td><Chip tone={ST_CHIP[p.status]}>{p.status}</Chip></td>
                      {canManage && (
                        <td className="c" style={{ maxWidth: 340 }}>
                          {p.status === '폐지' ? (
                            <form action={deletePolicy} style={{ display: 'inline' }}>
                              <input type="hidden" name="id" value={p.id} />
                              <button type="submit" className="btn sm danger">삭제</button>
                            </form>
                          ) : p.status === '개정중' ? (
                            <form action={reviseComplete} className="hstack" style={{ gap: 4, justifyContent: 'center', padding: '3px 0' }}>
                              <input type="hidden" name="id" value={p.id} />
                              <input aria-label="신 버전" className="input" name="version" required maxLength={20} placeholder="신 버전(v2.0)" style={{ height: 24, fontSize: 11, width: 100 }} />
                              <input aria-label="개정 문서" className="input" type="file" name="file" style={{ height: 24, fontSize: 10.5, width: 96, paddingTop: 2 }} title="개정본 첨부" />
                              <button type="submit" className="btn sm pri">개정 완료</button>
                            </form>
                          ) : (
                            <div className="hstack" style={{ justifyContent: 'center', gap: 6 }}>
                              <form action={reviewPolicy} style={{ display: 'inline' }}>
                                <input type="hidden" name="id" value={p.id} />
                                <button type="submit" className="btn sm" title={`재검토 완료 처리 — 최근검토일 갱신(예정 ${due})`}>재검토</button>
                              </form>
                              <form action={reviseStart} style={{ display: 'inline' }}>
                                <input type="hidden" name="id" value={p.id} />
                                <button type="submit" className="btn sm">개정 착수</button>
                              </form>
                              <form action={retirePolicy} style={{ display: 'inline' }}>
                                <input type="hidden" name="id" value={p.id} />
                                <button type="submit" className="btn sm">폐지</button>
                              </form>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>정책 생명주기</b> — 정책·지침·절차를 버전과 함께 등록하고 재검토 주기(반기·연1회 등)를 지정한다.
        재검토 예정일(최근검토일+주기)이 지난 시행 정책은 <b>재검토 경과</b>로 드러나며, <b>재검토</b>(내용 유효
        확인 → 시계 리셋)하거나 <b>개정 착수 → 개정 완료(신 버전 시행)</b>로 갱신한다. 폐지 정책만 대장에서 삭제한다.
      </div>
    </>
  )
}
