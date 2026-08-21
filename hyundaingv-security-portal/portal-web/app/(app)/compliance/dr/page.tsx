import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { groupGrantsAction, requireAction, requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { computeDrKpis, isTestOverdue, nextTestDue } from '@/lib/dr'
import { getStore, nextNo } from '@/lib/store'
import { DR_TEST_RESULTS, DR_TIERS } from '@/lib/types'
import type { DrTestResult, DrTier } from '@/lib/types'

const TIER_CHIP = { 핵심: 'err', 중요: 'warn', 일반: 'neutral' } as const
const RESULT_CHIP = { 미실시: 'neutral', 성공: 'ok', 부분성공: 'warn', 실패: 'err' } as const
const CYCLES: [number, string][] = [[6, '반기'], [12, '연 1회'], [24, '격년']]

function posHours(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n <= 8760 ? Math.round(n) : null  // 1시간~1년
}

async function addDrPlan(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/dr', 'BIZ_MGR', 'ADMIN')
  const system = String(formData.get('system') ?? '').trim().slice(0, 60)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const tier = String(formData.get('tier') ?? '') as DrTier
  const rtoHours = posHours(formData.get('rto'))
  const rpoHours = posHours(formData.get('rpo'))
  const cycle = Number(formData.get('cycle'))
  const s = getStore()
  const owner = String(formData.get('owner') ?? '')
  if (!system || !title || !DR_TIERS.includes(tier) || rtoHours === null || rpoHours === null
    || !s.people.some((p) => p.name === owner) || !CYCLES.some(([m]) => m === cycle)) return
  const id = nextNo('DR', today().slice(0, 4), s.drPlans.map((p) => p.id))
  // 등록 시 최근훈련일=오늘(수립 기준점) · 미실시 — 첫 복구훈련 전까지 훈련 주기 안에서 미실시 상태
  s.drPlans.unshift({ id, system, title, tier, rtoHours, rpoHours, owner, testCycleMonths: cycle, lastTestedAt: today(), lastResult: '미실시' })
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '복구계획 등록', `${id} ${title} (${system} · ${tier}) — RTO ${rtoHours}h · RPO ${rpoHours}h · 훈련 ${cycle}개월`)
  revalidatePath('/compliance/dr')
}

/** 복구훈련 기록 — 훈련 결과를 남기고 최근훈련일을 갱신해 훈련 주기 시계를 리셋한다. 담당도 재직자로 재배정
 *  (담당 퇴사 시 훈련 지연 알림이 그를 건너뛰어 통지 대상이 없어지는 폐쇄루프 단절 방어, 정책 재검토와 동일). */
async function recordTest(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/dr', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const result = String(formData.get('result') ?? '') as DrTestResult
  const s = getStore()
  const p = s.drPlans.find((x) => x.id === id)
  if (!p || !DR_TEST_RESULTS.includes(result)) return
  p.lastTestedAt = today()
  p.lastResult = result
  const owner = String(formData.get('owner') ?? '')
  const reassigned = owner !== p.owner && s.people.some((x) => x.name === owner)
  if (reassigned) p.owner = owner
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '복구계획 변경', `${id} ${p.title} — 복구훈련 ${result}(${today()}), 다음 예정 ${nextTestDue(p)}${reassigned ? ` · 담당 ${owner}` : ''}`)
  revalidatePath('/compliance/dr')
}

async function deleteDrPlan(formData: FormData) {
  'use server'
  const me = await requireAction('/compliance/dr', 'delete')  // 기능(삭제) 단위 권한 — 매트릭스 제한이 직접 POST 에도 적용
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const p = s.drPlans.find((x) => x.id === id)
  if (!p) return
  s.drPlans = s.drPlans.filter((x) => x.id !== id)
  // 참조무결성 — 복구계획 문서 첨부도 함께 정리(id 재사용 유령 첨부 방지)
  s.attachments = s.attachments.filter((a) => a.refId !== id)
  audit(me.name, '복구계획 삭제', `${id} ${p.title} (${p.system})`)
  revalidatePath('/compliance/dr')
}

export default async function DrPage() {
  const me = await requireMenu('/compliance/dr')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  // 삭제는 역할(canManage) 또는 그룹 기능 위임을 받은 사용자에게 노출 — 기존 역할 표시 유지 + 위임분. 훈련 기록은 canManage.
  const canDelete = canManage || groupGrantsAction(me.name, '/compliance/dr', 'delete')
  const t = today()
  // 훈련 경과 → 미실시 → 최근 실패·부분 → 정상 순, 동급이면 다음 훈련 예정일 빠른 순, 그다음 등급(핵심 우선).
  const rank = (p: (typeof s.drPlans)[number]) => (isTestOverdue(p, t) ? 0 : p.lastResult === '미실시' ? 1 : (p.lastResult === '실패' || p.lastResult === '부분성공') ? 2 : 3)
  const tierOrder = { 핵심: 0, 중요: 1, 일반: 2 } as const
  const rows = [...s.drPlans].sort((a, b) => rank(a) - rank(b) || nextTestDue(a).localeCompare(nextTestDue(b)) || tierOrder[a.tier] - tierOrder[b.tier])
  const k = computeDrKpis(s.drPlans, t)

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="재해복구·업무연속성"
        desc="핵심 업무·시스템의 복구목표(RTO/RPO)와 주기적 복구훈련을 관리한다 — 훈련 예정일 경과를 추적해 정기 복구훈련(ISMS 2.12 재해복구)을 강제한다." />

      <div className="stat-row">
        <Stat value={k.total} label="복구계획" note="대상 업무·시스템" />
        <Stat value={k.overdue} label="훈련 경과" tone={k.overdue > 0 ? 'err' : undefined} note="예정일 초과" />
        <Stat value={k.untested} label="미실시" tone={k.untested > 0 ? 'warn' : undefined} note="훈련 이력 없음" />
        <Stat value={k.failed} label="최근 실패·부분" tone={k.failed > 0 ? 'warn' : undefined} note="개선 필요" />
      </div>

      {canManage && (
        <Card title="복구계획 등록">
          <form action={addDrPlan} className="hstack">
            <input aria-label="대상 업무·시스템" className="input" name="system" required maxLength={60} placeholder="대상 업무·시스템" style={{ width: 150 }} />
            <input aria-label="계획명" className="input" name="title" required maxLength={120} placeholder="복구계획명" style={{ flex: 1 }} />
            <select aria-label="등급" className="select" name="tier">{DR_TIERS.map((x) => <option key={x}>{x}</option>)}</select>
            <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>RTO
              <input aria-label="RTO(시간)" className="input" name="rto" type="number" min={1} defaultValue={24} title="목표 복구시간(시간)" style={{ width: 64 }} />h
            </label>
            <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>RPO
              <input aria-label="RPO(시간)" className="input" name="rpo" type="number" min={1} defaultValue={24} title="목표 복구시점(시간)" style={{ width: 64 }} />h
            </label>
            <select aria-label="담당" className="select" name="owner">{s.people.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>
            <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>훈련
              <select aria-label="훈련 주기" className="select" name="cycle" defaultValue={12}>{CYCLES.map(([m, lbl]) => <option key={m} value={m}>{lbl}</option>)}</select>
            </label>
            <input className="input" type="file" name="file" style={{ width: 120, paddingTop: 4 }} title="복구계획 문서 첨부" />
            <button type="submit" className="btn pri">등록</button>
          </form>
        </Card>
      )}

      <Card title="재해복구 관리대장" pad={false}
        actions={<a className="btn sm" href="/api/export?type=dr-plans">엑셀 다운로드</a>}>
        {rows.length === 0 ? (
          <div className="empty">등록된 복구계획이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>대상 · 계획</th><th>등급</th><th className="num">RTO/RPO</th><th>담당</th><th>최근 훈련</th><th>다음 예정</th>{(canManage || canDelete) && <th className="c">처리</th>}</tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const due = nextTestDue(p)
                  const overdue = isTestOverdue(p, t)
                  return (
                    <tr key={p.id}>
                      <td className="code">{p.id}</td>
                      <td className="strong">{p.title}<Clip count={attachCount(p.id)} title="복구계획 문서" /><span className="mut" style={{ display: 'block', fontSize: 11 }}>{p.system}</span></td>
                      <td><Chip tone={TIER_CHIP[p.tier]} bare>{p.tier}</Chip></td>
                      <td className="num tnum">{p.rtoHours}h / {p.rpoHours}h</td>
                      <td>{p.owner}</td>
                      <td><Chip tone={RESULT_CHIP[p.lastResult]} bare>{p.lastResult}</Chip>{p.lastResult !== '미실시' && <span className="mut" style={{ fontSize: 10.5 }}> {p.lastTestedAt}</span>}</td>
                      <td className="tnum">{due}{overdue && <Chip tone="err" bare>경과</Chip>}</td>
                      {(canManage || canDelete) && (
                        <td className="c" style={{ maxWidth: 360 }}>
                          <div className="hstack" style={{ justifyContent: 'center', gap: 6 }}>
                            {canManage && (
                            <form action={recordTest} className="hstack" style={{ gap: 3, alignItems: 'center', display: 'inline-flex' }}>
                              <input type="hidden" name="id" value={p.id} />
                              <select aria-label="훈련 결과" className="select" name="result" title="복구훈련 결과" style={{ height: 24, fontSize: 11, padding: '0 4px' }}>{DR_TEST_RESULTS.map((x) => <option key={x}>{x}</option>)}</select>
                              <select aria-label="담당" className="select" name="owner" defaultValue={p.owner} title="담당(훈련 기록 시 재직자로 확인·이관)" style={{ height: 24, fontSize: 11, padding: '0 4px', maxWidth: 76 }}>
                                {(s.people.some((x) => x.name === p.owner) ? s.people : [{ name: p.owner, dept: '(퇴사)' }, ...s.people]).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                              </select>
                              <input aria-label="훈련 증적" className="input" type="file" name="file" style={{ height: 24, fontSize: 10.5, width: 76, paddingTop: 2 }} title="훈련 결과 증적" />
                              <button type="submit" className="btn sm pri" title="복구훈련 결과 기록 — 최근훈련일 갱신">훈련 기록</button>
                            </form>
                            )}
                            {canDelete && (
                            <form action={deleteDrPlan} style={{ display: 'inline' }}>
                              <input type="hidden" name="id" value={p.id} />
                              <button type="submit" className="btn sm danger">삭제</button>
                            </form>
                            )}
                          </div>
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
        <b>복구훈련 주기</b> — 핵심 업무·시스템의 복구계획을 RTO(목표 복구시간)·RPO(목표 복구시점)와 함께
        등록하고 훈련 주기(반기·연1회 등)를 지정한다. 다음 훈련 예정일(최근훈련일+주기)이 지난 계획은
        <b>훈련 경과</b>로 드러나며, 복구훈련을 실시해 결과(성공·부분성공·실패)를 기록하면 훈련 시계가 리셋된다.
      </div>
    </>
  )
}
