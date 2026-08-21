import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { groupGrantsAction, requireAction, requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { computeRiskKpis, isRiskClosed, riskScore, riskTier, upsertRiskSnapshot } from '@/lib/risk'
import { getStore, nextNo } from '@/lib/store'
import { RISK_STATUSES, RISK_TREATMENTS } from '@/lib/types'
import type { RiskStatus, RiskTreatment } from '@/lib/types'

const ST_CHIP: Record<RiskStatus, 'neutral' | 'warn' | 'ok'> = { 식별: 'neutral', 조치중: 'warn', 완료: 'ok' }
const NEXT: Partial<Record<RiskStatus, RiskStatus>> = { 식별: '조치중', 조치중: '완료' }
const LI = [1, 2, 3, 4, 5] as const

function parseLI(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null
}

async function addRisk(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/risks', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const area = String(formData.get('area') ?? '').trim().slice(0, 60)
  const threat = String(formData.get('threat') ?? '').trim().slice(0, 80)
  const vulnerability = String(formData.get('vulnerability') ?? '').trim().slice(0, 120)
  const likelihood = parseLI(formData.get('likelihood'))
  const impact = parseLI(formData.get('impact'))
  const treatment = String(formData.get('treatment') ?? '') as RiskTreatment
  const dueDate = String(formData.get('dueDate') ?? '')
  const s = getStore()
  const owner = String(formData.get('owner') ?? '')
  // 담당은 실존 인원만 — 미등록·과대 문자열 저장 차단(임의 POST 대비, 다른 화면 select 검증과 동일)
  if (!title || !area || !threat || !vulnerability || likelihood === null || impact === null
    || !RISK_TREATMENTS.includes(treatment) || !s.people.some((p) => p.name === owner)
    || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return
  const plan = String(formData.get('plan') ?? '').trim().slice(0, 200)
  const id = nextNo('RK', today().slice(0, 4), s.riskItems.map((r) => r.id))
  s.riskItems.unshift({ id, title, area, threat, vulnerability, likelihood, impact, treatment, owner, plan, dueDate, status: '식별', identifiedAt: today() })
  // 위험평가서·조치 증적 (첨부 시트: 정보보호 위험평가)
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '위험 등록', `${id} ${title} — ${area} (위험도 ${riskScore({ likelihood, impact })} ${riskTier(riskScore({ likelihood, impact })).label})`)
  revalidatePath('/compliance/risks')
}

/** 재평가 — 발생가능성·영향도·처리전략·조치계획·기한을 갱신한다(위험도·등급은 lib/risk 파생). 종결 건은 불가. */
async function reassessRisk(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/risks', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const r = s.riskItems.find((x) => x.id === id)
  if (!r || isRiskClosed(r)) return
  const likelihood = parseLI(formData.get('likelihood'))
  const impact = parseLI(formData.get('impact'))
  const treatment = String(formData.get('treatment') ?? '') as RiskTreatment
  const dueDate = String(formData.get('dueDate') ?? '')
  if (likelihood === null || impact === null || !RISK_TREATMENTS.includes(treatment) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return
  r.likelihood = likelihood; r.impact = impact; r.treatment = treatment; r.dueDate = dueDate
  r.plan = String(formData.get('plan') ?? '').trim().slice(0, 200)
  // 담당 재배정 — 재직자(s.people)로만 이관한다. 담당이 퇴사하면 조치 지연 알림(재직 교집합)이 그를 건너뛰어
  // 아무도 통지받지 못하는데(폐쇄루프 단절), 삭제는 미종결이라 막혀 있고 재평가로만 살아있는 담당에게 넘길 수
  // 있다. 제출값이 퇴사자(현 담당 유지)면 무변경(교집합 실패 → no-op). 이관 시 감사에 남긴다.
  const owner = String(formData.get('owner') ?? '')
  const reassigned = owner !== r.owner && s.people.some((p) => p.name === owner)
  if (reassigned) r.owner = owner
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '위험 변경', `${id} 재평가 — 위험도 ${riskScore(r)} ${riskTier(riskScore(r)).label} · 처리 ${treatment}${reassigned ? ` · 담당 ${owner}` : ''}`)
  revalidatePath('/compliance/risks')
}

async function advanceRisk(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/risks', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const r = s.riskItems.find((x) => x.id === id)
  if (!r) return
  const next = NEXT[r.status]
  if (!next) return
  r.status = next
  audit(me.name, '위험 변경', `${id} ${r.title} — ${next}${next === '완료' ? ' (종결)' : ''}`)
  revalidatePath('/', 'layout')
}

async function deleteRisk(formData: FormData) {
  'use server'
  const me = await requireAction('/compliance/risks', 'delete')  // 기능(삭제) 단위 권한 — 매트릭스 제한이 직접 POST 에도 적용
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const r = s.riskItems.find((x) => x.id === id)
  // 종결(완료)된 위험만 삭제 — 미종결 위험은 종결(수용·완화 조치)로 처리하지 삭제로 없애지 않는다(ISMS 감사
  // 트레일 보존). 화면은 종결 건에만 삭제 버튼을 노출하나 서버액션은 직접 POST 가능하므로 서버에서 가드한다
  // (updateProgress 완료 가드·deleteSettlement 상태 가드와 동일 방어 — 미종결 위험 은닉 삭제 차단).
  if (!r || !isRiskClosed(r)) return
  s.riskItems = s.riskItems.filter((x) => x.id !== id)
  // 참조무결성 — 위험평가 증적 첨부도 함께 정리(id 재사용 유령 첨부 방지, deleteSettlement·게시물 삭제와 동일)
  s.attachments = s.attachments.filter((a) => a.refId !== id)
  audit(me.name, '위험 삭제', `${id} ${r.title} — ${r.area}`)
  revalidatePath('/compliance/risks')
}

/** 위험 추세 스냅샷 기록 — 현재 위험 KPI 를 당월 스냅샷으로 upsert(위험 감소 추이, ISMS 전기 대비 개선).
 *  컴플라이언스 포스처 스냅샷과 동일 경로 — 수동 기록, 일배치도 공유(lib/risk upsertRiskSnapshot). */
async function recordRiskSnapshot() {
  'use server'
  const me = await requireMenuRole('/compliance/risks', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const snap = upsertRiskSnapshot(s, me.name)
  audit(me.name, '위험 스냅샷', `${snap.period} — 전체 ${snap.total} · 미종결 ${snap.open} · 높음↑ ${snap.highOpen} · 경과 ${snap.overdue} · 종결률 ${snap.treatedRate}%`)
  revalidatePath('/compliance/risks')
}

export default async function RisksPage() {
  const me = await requireMenu('/compliance/risks')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  // 삭제는 역할(canManage) 또는 그룹 기능 위임을 받은 사용자에게 노출한다. canManage 는 기존 역할 표시를
  // 그대로 유지하고(런타임 제한은 서버 requireAction 가 강제) 위임분만 더한다. 그 외 관리 컨트롤은 canManage.
  const canDelete = canManage || groupGrantsAction(me.name, '/compliance/risks', 'delete')
  const t = today()
  // 위험도 내림차순 → 미종결 우선 (우선 처리 대상이 상단에). 동점이면 기한 빠른 순.
  const rows = [...s.riskItems].sort((a, b) =>
    Number(isRiskClosed(a)) - Number(isRiskClosed(b)) || riskScore(b) - riskScore(a) || String(a.dueDate).localeCompare(String(b.dueDate)))
  const k = computeRiskKpis(s.riskItems, t)
  // 5×5 히트맵 — 미종결 위험의 (발생가능성×영향도) 분포. 영향도 큰 행이 위로 오게 역순 렌더.
  const openItems = s.riskItems.filter((r) => !isRiskClosed(r))
  const cellCount = (l: number, i: number) => openItems.filter((r) => Math.round(r.likelihood) === l && Math.round(r.impact) === i).length

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="정보보호 위험평가"
        desc="자산·영역의 위협×취약점을 발생가능성·영향도로 평가하고, 처리 전략(완화·수용·전가·회피)과 조치계획으로 관리한다 (ISMS 위험관리대장)." />

      <div className="stat-row">
        <Stat value={k.total} label="전체 위험" note={`미종결 ${k.open}건`} />
        <Stat value={k.highOpen} label="높음↑ 미종결" tone={k.highOpen > 0 ? 'err' : undefined} note="높음·심각" />
        <Stat value={k.overdue} label="조치기한 경과" tone={k.overdue > 0 ? 'warn' : undefined} note="미종결 기준" />
        <Stat value={s.riskItems.filter(isRiskClosed).length} label="종결" note="완료" />
        <Stat value={s.riskItems.length ? `${k.treatedRate}%` : '-'} label="종결률" />
      </div>

      <Card title="위험 매트릭스 (5×5)"
        actions={<span className="mut" style={{ fontSize: 11 }}>미종결 위험 분포 · 발생가능성(→) × 영향도(↑)</span>}>
        <div className="tbl-wrap">
          <table className="tbl" style={{ tableLayout: 'fixed', maxWidth: 460 }}>
            <tbody>
              {[5, 4, 3, 2, 1].map((i) => (
                <tr key={i}>
                  <td className="mut c" style={{ width: 60, fontSize: 11 }}>영향 {i}</td>
                  {LI.map((l) => {
                    const n = cellCount(l, i)
                    const tier = riskTier(l * i)
                    return (
                      <td key={l} className="c" style={{ height: 34 }}>
                        {n > 0
                          ? <Chip tone={tier.tone} bare>{n}</Chip>
                          : <span className="mut" style={{ fontSize: 11, opacity: 0.4 }}>·</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td></td>
                {LI.map((l) => <td key={l} className="mut c" style={{ fontSize: 11 }}>발생 {l}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && (
        <Card title="위험 등록">
          <form action={addRisk} className="vstack" style={{ gap: 8 }}>
            <div className="hstack">
              <input aria-label="위험 시나리오" className="input" name="title" required maxLength={120} placeholder="위험 시나리오" style={{ flex: 1 }} />
              <input aria-label="대상 자산·영역" className="input" name="area" required maxLength={60} placeholder="대상 자산·영역" style={{ width: 150 }} />
              <select aria-label="담당" className="select" name="owner">
                {s.people.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.dept})</option>)}
              </select>
            </div>
            <div className="hstack">
              <input aria-label="위협" className="input" name="threat" required maxLength={80} placeholder="위협" style={{ flex: 1 }} />
              <input aria-label="취약점" className="input" name="vulnerability" required maxLength={120} placeholder="취약점" style={{ flex: 1 }} />
            </div>
            <div className="hstack">
              <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>발생가능성
                <select aria-label="발생가능성" className="select" name="likelihood" defaultValue={3}>{LI.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </label>
              <label className="hstack" style={{ gap: 4, fontSize: 11.5, color: 'var(--dim)' }}>영향도
                <select aria-label="영향도" className="select" name="impact" defaultValue={3}>{LI.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </label>
              <select aria-label="처리 전략" className="select" name="treatment">{RISK_TREATMENTS.map((x) => <option key={x}>{x}</option>)}</select>
              <input aria-label="조치기한" className="input" type="date" name="dueDate" required defaultValue={t} style={{ width: 150 }} />
            </div>
            <div className="hstack">
              <input aria-label="조치계획" className="input" name="plan" maxLength={200} placeholder="조치계획 (완화 조치·수용 근거 등)" style={{ flex: 1 }} />
              <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="위험평가서·증적 첨부" />
              <button type="submit" className="btn pri">등록</button>
            </div>
          </form>
        </Card>
      )}

      <Card title="위험관리대장" pad={false}
        actions={<a className="btn sm" href="/api/export?type=risks">엑셀 다운로드</a>}>
        {rows.length === 0 ? (
          <div className="empty">등록된 위험이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>위험 시나리오 · 대상</th><th>위협 · 취약점</th><th className="num">가능성×영향</th><th className="num">위험도</th><th>처리</th><th>담당</th><th>기한</th><th>상태</th>{(canManage || canDelete) && <th className="c">처리</th>}</tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const score = riskScore(r)
                  const tier = riskTier(score)
                  const next = NEXT[r.status]
                  const overdue = !isRiskClosed(r) && r.dueDate < t
                  return (
                    <tr key={r.id}>
                      <td className="code">{r.id}</td>
                      <td className="strong" style={{ maxWidth: 220 }}>{r.title}<Clip count={attachCount(r.id)} title="위험평가 증적" /><span className="mut" style={{ display: 'block', fontSize: 11 }}>{r.area}</span></td>
                      <td style={{ maxWidth: 240, fontSize: 11.5 }}>{r.threat}<span className="mut" style={{ display: 'block' }}>{r.vulnerability}</span></td>
                      <td className="num tnum">{Math.round(r.likelihood)} × {Math.round(r.impact)}</td>
                      <td className="num"><Chip tone={tier.tone} bare>{score} {tier.label}</Chip></td>
                      <td><Chip tone="neutral" bare>{r.treatment}</Chip></td>
                      <td>{r.owner}</td>
                      <td className="tnum">{r.dueDate}{overdue && <Chip tone="err" bare>경과</Chip>}</td>
                      <td><Chip tone={ST_CHIP[r.status]}>{r.status}</Chip></td>
                      {(canManage || canDelete) && (
                        <td className="c" style={{ maxWidth: 380 }}>
                          {isRiskClosed(r) ? (
                            canDelete ? (
                            <form action={deleteRisk} style={{ display: 'inline' }}>
                              <input type="hidden" name="id" value={r.id} />
                              <button type="submit" className="btn sm danger">삭제</button>
                            </form>
                            ) : null
                          ) : canManage ? (
                            <div className="hstack" style={{ justifyContent: 'center', gap: 6 }}>
                              <form action={reassessRisk} className="hstack" style={{ gap: 3, alignItems: 'center', padding: '3px 0' }}>
                                <input type="hidden" name="id" value={r.id} />
                                <select aria-label="재평가 담당" className="select" name="owner" defaultValue={r.owner} title="담당(재배정 — 담당 퇴사 시 재직자로 이관)" style={{ height: 24, fontSize: 11, padding: '0 4px', maxWidth: 90 }}>
                                  {(s.people.some((p) => p.name === r.owner) ? s.people : [{ name: r.owner, dept: '(퇴사)' }, ...s.people]).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                                </select>
                                <select aria-label="재평가 발생가능성" className="select" name="likelihood" defaultValue={Math.round(r.likelihood)} title="발생가능성" style={{ height: 24, fontSize: 11, padding: '0 4px' }}>{LI.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                                <span className="mut" style={{ fontSize: 10 }}>×</span>
                                <select aria-label="재평가 영향도" className="select" name="impact" defaultValue={Math.round(r.impact)} title="영향도" style={{ height: 24, fontSize: 11, padding: '0 4px' }}>{LI.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                                <select aria-label="재평가 처리전략" className="select" name="treatment" defaultValue={r.treatment} title="처리 전략" style={{ height: 24, fontSize: 11, padding: '0 4px' }}>{RISK_TREATMENTS.map((x) => <option key={x}>{x}</option>)}</select>
                                <input aria-label="재평가 기한" className="input" type="date" name="dueDate" defaultValue={r.dueDate} title="조치기한" style={{ height: 24, fontSize: 11, width: 122 }} />
                                <input aria-label="조치계획" className="input" name="plan" maxLength={200} defaultValue={r.plan} title="조치계획" placeholder="조치계획" style={{ height: 24, fontSize: 11, width: 120 }} />
                                <button type="submit" className="btn sm" title="재평가 저장">재평가</button>
                              </form>
                              {next && (
                                <form action={advanceRisk} style={{ display: 'inline' }}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <button type="submit" className="btn sm pri">{next} →</button>
                                </form>
                              )}
                            </div>
                          ) : null}
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

      <Card title="위험 추세" pad={false}
        actions={<div className="hstack" style={{ gap: 6 }}>
          {s.riskSnapshots.length > 0 && <a className="btn sm" href="/api/export?type=risk-trend">엑셀 다운로드</a>}
          {canManage && <form action={recordRiskSnapshot}><button type="submit" className="btn sm" title="현재 위험 KPI 를 당월 스냅샷으로 기록 — 위험 감소 추이(ISMS 전기 대비 개선)">현황 스냅샷 기록</button></form>}
        </div>}>
        {s.riskSnapshots.length === 0 ? (
          <div className="empty">기록된 스냅샷이 없습니다 — &lsquo;현황 스냅샷 기록&rsquo;으로 이번 달 위험 현황을 남기세요.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>기간</th><th className="num">전체</th><th className="num">미종결</th><th className="num">높음↑ 미종결</th><th className="num">기한 경과</th><th className="num">종결률</th><th>기록</th></tr></thead>
              <tbody>
                {[...s.riskSnapshots].sort((a, b) => String(a.period).localeCompare(String(b.period))).map((snap, i, arr) => {
                  // 높음↑ 미종결 증감 — 감소(▼)가 위험 감소(개선), 증가(▲)가 악화. 전기 대비 개선 추이 신호.
                  const delta = i > 0 ? snap.highOpen - arr[i - 1].highOpen : 0
                  return (
                    <tr key={snap.id}>
                      <td className="tnum">{snap.period}</td>
                      <td className="num">{snap.total}</td>
                      <td className="num">{snap.open}</td>
                      <td className="num"><Chip tone={snap.highOpen > 0 ? 'err' : 'ok'} bare>{snap.highOpen}</Chip>{delta !== 0 && <span className="mut" style={{ fontSize: 10.5 }}> {delta < 0 ? '▼' : '▲'}{Math.abs(delta)}</span>}</td>
                      <td className="num">{snap.overdue}</td>
                      <td className="num">{snap.treatedRate}%</td>
                      <td className="mut" style={{ fontSize: 11 }}>{snap.at} · {snap.by}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>위험처리 절차</b> — 자산·영역의 위협×취약점을 식별하고 발생가능성·영향도(각 1~5)로 평가한다.
        위험도(=가능성×영향, 1~25)가 <b>높음(≥10)·심각(≥15)</b>인 항목이 우선 처리 대상이다. 처리 전략을
        완화·수용·전가·회피 중 선택하고 조치계획·기한·담당을 지정해 조치중 → 완료(종결)까지 추적한다.
        조치기한이 지난 미종결 위험은 경과로 표시되어 지연을 드러낸다.
      </div>
    </>
  )
}
