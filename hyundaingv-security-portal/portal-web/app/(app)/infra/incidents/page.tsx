import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerGenerated, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { monthlyIncidentStats } from '@/lib/infra'
import { getStore, isCodeActive, nextNo } from '@/lib/store'
import type { IncidentGrade } from '@/lib/types'

const GRADE_TONE: Record<IncidentGrade, 'err' | 'warn' | 'neutral'> = { '1등급': 'err', '2등급': 'warn', '3등급': 'neutral' }

/** 장애등급은 공통코드(FAULT_GRADE)가 단일 원천 — 사용중지·기간만료 코드는 등록 화면에서 사라진다 */
function enabledGrades(s: ReturnType<typeof getStore>): IncidentGrade[] {
  const group = s.codeGroups.find((g) => g.id === 'FAULT_GRADE')
  return (group?.values.filter(isCodeActive).map((v) => v.code) ?? []) as IncidentGrade[]
}

/** 장애항목 — 공통코드 FAULT_ITEM 소비 (요구사항 36행: 항목·등급·조치기준 공통코드화) */
function activeItems(s: ReturnType<typeof getStore>): string[] {
  const group = s.codeGroups.find((g) => g.id === 'FAULT_ITEM')
  return group?.values.filter(isCodeActive).map((v) => v.code) ?? []
}

async function addIncident(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/incidents', 'BIZ_MGR', 'ADMIN')
  const system = String(formData.get('system') ?? '').trim().slice(0, 60)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const grade = String(formData.get('grade') ?? '') as IncidentGrade
  const category = String(formData.get('category') ?? '')
  const s = getStore()
  if (!system || !title || !enabledGrades(s).includes(grade)) return
  if (category && !activeItems(s).includes(category)) return
  const id = nextNo('FL', today().slice(0, 4), s.incidents.map((i) => i.id))
  s.incidents.unshift({ id, system, title, grade, category: category || undefined, occurredAt: today(), status: '조치중', reportStatus: '미상신' })
  registerUpload(id, formData.get('file'), me.name)
  // §VI 이력추적성 — 장애 등록도 통제 행위(등록자·시점 추적). 인프라 형제 화면(systems·racks·operations)과 정합.
  audit(me.name, '장애 등록', `${id} ${grade} ${system} — ${title}`)
  revalidatePath('/infra/incidents')
}

async function resolve(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/incidents', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const action = String(formData.get('action') ?? '').trim().slice(0, 300)
  const countermeasure = String(formData.get('countermeasure') ?? '').trim().slice(0, 300)
  if (!action) return
  const s = getStore()
  const inc = s.incidents.find((i) => i.id === id && i.status === '조치중')
  if (!inc) return
  inc.action = action
  if (countermeasure) inc.countermeasure = countermeasure
  inc.status = '조치완료'
  audit(me.name, '장애 조치', `${inc.id} 조치완료 — ${action.slice(0, 60)}`)
  revalidatePath('/infra/incidents')
}

async function submitReport(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/incidents', 'BIZ_MGR', 'ADMIN')
  const ids = formData.getAll('ids').map(String)
  const s = getStore()
  // 결재진행(완료) 건은 선택 못한다 — 미상신 건만 상신 대상 (요구사항 결재 시트 8번).
  // 조치완료 조건은 UI 체크박스뿐 아니라 서버에서도 재검증한다 — 조작 요청으로 조치중 건이 묶이는 것 차단
  const targets = s.incidents.filter((i) => ids.includes(i.id) && i.reportStatus === '미상신' && i.status === '조치완료')
  if (targets.length === 0) return

  const year = today().slice(0, 4)
  // 묶음 번호는 불변 원장인 결재 이력에서 채번한다 — 행의 reportRef 는 반려 시 초기화되어
  // 번호가 재사용되고, 반려된 과거 결재 문서 상세가 새 묶음을 가리키게 된다
  const ref = nextNo('IR', year, s.approvals.filter((a) => a.docType === '장애보고 상신' && a.ref).map((a) => a.ref!))
  for (const inc of targets) {
    inc.reportRef = ref
    inc.reportStatus = '결재중'
  }

  // 폐쇄 루프 — 장애통계 상신이 기본 결재선으로 흐르고, 승인되면 묶인 장애 건이 결재완료로 전파된다.
  // 엑셀양식(XT) 자동첨부 — 요구사항 결재 시트 8번 '첨부파일자동생성 o'
  registerGenerated(ref, '장애보고 상신', me.name)
  draftApproval({ docType: '장애보고 상신', title: `[장애보고] ${targets.length}건 (${today()} 취합, 엑셀양식 자동첨부)`, ref, drafter: me, items: targets.map((i) => i.id) })
  revalidatePath('/', 'layout')
}

async function addCmResult(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/incidents', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const cmResult = String(formData.get('cmResult') ?? '').trim().slice(0, 300)
  if (!cmResult) return
  const s = getStore()
  const inc = s.incidents.find((i) => i.id === id && i.countermeasure && !i.cmResult)
  if (!inc) return
  inc.cmResult = cmResult
  audit(me.name, '장애 조치', `${inc.id} 재발방지 결과 등록`)
  revalidatePath('/infra/incidents')
}

export default async function IncidentsPage() {
  await requireMenu('/infra/incidents')
  const s = getStore()

  // 월별 장애 통계 — 발생월 × 등급 집계는 lib/infra 단일 원천(화면 통계표와 export 가 같은 값). 등급 컬럼은
  // 공통코드 전체(중지 포함) + 실제 장애 데이터 등급의 합집합이라, 코드 삭제분 과거 장애도 '계'와 정합한다.
  const stats = monthlyIncidentStats(s)
  const open = s.incidents.filter((i) => i.status === '조치중')
  const unreported = s.incidents.filter((i) => i.status === '조치완료' && i.reportStatus === '미상신')
  const cmPending = s.incidents.filter((i) => i.countermeasure && !i.cmResult)

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="장애관리 · 통계 · 대책"
        desc="장애 등록·조치 → 주기별 통계 취합 결재상신 → 향후대책 결과 등록까지 장애 전 주기를 추적한다." />

      <div className="stat-row">
        <Stat value={s.incidents.length} label="전체 장애" />
        <Stat value={open.length} label="조치중" tone={open.length > 0 ? 'err' : undefined} />
        <Stat value={unreported.length} label="보고 미상신" tone={unreported.length > 0 ? 'warn' : undefined} note="조치완료 기준" />
        <Stat value={cmPending.length} label="대책 결과 미등록" tone={cmPending.length > 0 ? 'warn' : undefined} />
      </div>

      {/* 주기별 장애 통계 (제품안내서 III장) — 발생월 × 등급 집계, 통계 상신의 취합 근거 */}
      <Card title="월별 장애 통계" pad={false}
        actions={<a className="btn sm" href="/api/export?type=incident-stats" title="월별 장애 통계 (발생월×등급, 주기별 보고 근거)">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>발생월</th>{stats.grades.map((g) => <th key={g} className="num">{g}</th>)}<th className="num">계</th><th className="num">조치완료</th></tr></thead>
            <tbody>
              {stats.months.map((m) => (
                <tr key={m.month}>
                  <td className="tnum strong">{m.month}</td>
                  {stats.grades.map((g) => (
                    <td key={g} className="num">{m.byGrade[g] || '-'}</td>
                  ))}
                  <td className="num strong">{m.total}</td>
                  <td className="num">{m.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="장애 등록">
        <form action={addIncident} className="hstack">
          <input aria-label="대상 시스템" className="input" name="system" required maxLength={60} placeholder="대상 시스템" style={{ width: 160 }} />
          <input aria-label="장애 내용" className="input" name="title" required maxLength={120} placeholder="장애 내용" style={{ flex: 1 }} />
          <select className="select" name="category" title="장애항목 — 공통코드 FAULT_ITEM">
            {activeItems(s).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="장애등급" className="select" name="grade">
            {enabledGrades(s).map((g) => <option key={g}>{g}</option>)}
          </select>
          <input className="input" type="file" name="file" style={{ width: 220, paddingTop: 4 }} title="장애 증적 첨부" />
          <button type="submit" className="btn pri">등록</button>
        </form>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
          조치기준(공통코드): {(s.codeGroups.find((g) => g.id === 'ACTION_CRITERIA')?.values ?? []).filter(isCodeActive).map((v) => v.code).join(' · ') || '-'}
        </div>
      </Card>

      <Card title="장애 목록 · 통계 상신" pad={false}
        actions={<a className="btn sm" href="/api/export?type=incidents">엑셀 다운로드</a>}>
        <form action={submitReport}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th className="c">선택</th><th>장애번호</th><th>시스템</th><th>내용</th><th>항목</th><th>등급</th><th>발생일</th><th>조치</th><th>보고 상태</th></tr>
              </thead>
              <tbody>
                {s.incidents.map((i) => (
                  <tr key={i.id}>
                    <td className="c">
                      {i.status === '조치완료' && i.reportStatus === '미상신'
                        ? <input aria-label="선택" type="checkbox" name="ids" value={i.id} />
                        : <span className="mut">-</span>}
                    </td>
                    <td className="code">{i.id}</td>
                    <td>{i.system}</td>
                    <td className="strong">{i.title}<Clip count={attachCount(i.id)} title="증적 첨부" /></td>
                    <td>{i.category ?? <span className="mut">-</span>}</td>
                    <td><Chip tone={GRADE_TONE[i.grade]} bare>{i.grade}</Chip></td>
                    <td className="tnum">{i.occurredAt}</td>
                    <td>
                      {i.status === '조치완료' ? (
                        <span title={i.action}>{i.action}</span>
                      ) : (
                        <Chip tone="err">조치중</Chip>
                      )}
                    </td>
                    <td>
                      {i.reportStatus === '결재완료' ? <Chip tone="ok" bare>결재완료</Chip> :
                       i.reportStatus === '결재중' ? <Chip tone="info" bare>결재중</Chip> :
                       <Chip tone="neutral" bare>미상신</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hstack" style={{ borderTop: '1px solid var(--line)', padding: '9px 14px', justifyContent: 'space-between' }}>
            <span className="dim" style={{ fontSize: 11.5 }}>
              조치완료·미상신 건만 선택 가능 — 상신 시 엑셀양식이 자동첨부된다 (결재 승인 시 결재완료로 전파).
            </span>
            <button type="submit" className="btn pri" disabled={unreported.length === 0}>선택 건 장애보고 상신</button>
          </div>
        </form>
      </Card>

      <div className="cols c2">
        <Card title="조치 등록 — 조치중 장애" pad={false}>
          {open.length === 0 ? (
            <div className="empty">조치중인 장애가 없습니다.</div>
          ) : (
            <div className="stub-list">
              {open.map((i) => (
                <div key={i.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div className="hstack" style={{ marginBottom: 7 }}>
                    <span className="mono dim">{i.id}</span>
                    <span className="strong">{i.title}</span>
                    <Chip tone={GRADE_TONE[i.grade]} bare>{i.grade}</Chip>
                  </div>
                  <form action={resolve} className="vstack" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={i.id} />
                    <input aria-label="조치내역" className="input" name="action" required maxLength={300} placeholder="조치내역" />
                    <div className="hstack">
                      <input aria-label="향후대책" className="input" name="countermeasure" maxLength={300} placeholder="향후대책 (선택)" style={{ flex: 1 }} />
                      <button type="submit" className="btn sm pri">조치완료</button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="향후대책 — 결과 등록" pad={false}>
          {cmPending.length === 0 ? (
            <div className="empty">결과 등록 대기 중인 대책이 없습니다.</div>
          ) : (
            <div className="stub-list">
              {cmPending.map((i) => (
                <div key={i.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div className="hstack" style={{ marginBottom: 7 }}>
                    <span className="mono dim">{i.id}</span>
                    <span className="strong">{i.countermeasure}</span>
                  </div>
                  <form action={addCmResult} className="hstack">
                    <input type="hidden" name="id" value={i.id} />
                    <input aria-label="대책 이행 결과" className="input" name="cmResult" required maxLength={300} placeholder="대책 이행 결과" style={{ flex: 1 }} />
                    <button type="submit" className="btn sm">결과 등록</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
