import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { ACCOUNTS } from '@/lib/session'
import { getStore, isCodeActive, nextNo, type Store } from '@/lib/store'
import type { InspectionCycle, InspectionStatus } from '@/lib/types'

const SOURCES = ['ISMS', '외부기관'] as const

/** 사용 가능한 점검 주기 — 공통코드 INSPECT_CYCLE (사용중지·기간만료 제외) */
function activeCycles(s: Store): InspectionCycle[] {
  const group = s.codeGroups.find((g) => g.id === 'INSPECT_CYCLE')
  return (group?.values.filter(isCodeActive).map((v) => v.code) ?? []) as InspectionCycle[]
}

/** 기준 항목 추가 — 검증 통과 시 CK 채번으로 등록 (addItem·CSV 업로드 공용) */
function applyItem(s: Store, category: string, subCategory: string, control: string, cycle: string, source: string): string | null {
  if (!category || !control) return null
  if (!activeCycles(s).includes(cycle as InspectionCycle) || !SOURCES.includes(source as (typeof SOURCES)[number])) return null
  if (s.inspectionItems.some((i) => i.control === control)) return null
  const max = s.inspectionItems.reduce((m, i) => Math.max(m, Number(i.id.replace('CK-', '')) || 0), 0)
  const id = `CK-${String(max + 1).padStart(2, '0')}`
  s.inspectionItems.push({ id, category, subCategory: subCategory || undefined, control, cycle: cycle as InspectionCycle, source: source as (typeof SOURCES)[number] })
  return id
}

/** 기준관리 등록 (요구사항 62행 저장 ◎) — ISMS 대분류·중분류 코드 관리 */
async function addItem(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/inspection', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const id = applyItem(s,
    String(formData.get('category') ?? '').trim().slice(0, 40),
    String(formData.get('subCategory') ?? '').trim().slice(0, 40),
    String(formData.get('control') ?? '').trim().slice(0, 120),
    String(formData.get('cycle') ?? ''), String(formData.get('source') ?? ''))
  if (!id) return
  audit(me.name, '점검 기준 변경', `${id} 등록 — ${String(formData.get('control') ?? '').slice(0, 80)}`)
  revalidatePath('/compliance/inspection')
}

/** 기준관리 삭제 (요구사항 62행 삭제 ◎) — 계획이 참조 중인 항목은 삭제 불가 */
async function deleteItem(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/inspection', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const item = s.inspectionItems.find((i) => i.id === id)
  if (!item || s.inspectionPlans.some((p) => p.itemId === id)) return
  s.inspectionItems = s.inspectionItems.filter((i) => i.id !== id)
  audit(me.name, '점검 기준 변경', `${id} 삭제 — ${item.control}`)
  revalidatePath('/compliance/inspection')
}

/** 기준 엑셀 업로드 (요구사항 62행 업로드 ◎) — CSV 한 줄에 대분류,통제항목,주기,구분[,중분류] */
async function uploadItems(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/inspection', 'BIZ_MGR', 'ADMIN')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) return
  const s = getStore()
  let applied = 0
  // 행 수 상한 — 대량 업로드로 기준 목록·선택지가 무한정 불어나는 것을 막는다
  for (const line of (await file.text()).split(/\r?\n/).slice(0, 500)) {
    const [category = '', control = '', cycle = '', source = '', subCategory = ''] = line.split(',').map((x) => x.trim())
    if (applyItem(s, category.slice(0, 40), subCategory.slice(0, 40), control.slice(0, 120), cycle, source)) applied += 1
  }
  if (applied === 0) return
  audit(me.name, '점검 기준 변경', `업로드 ${applied}건 반영 (${file.name.slice(0, 60)})`)
  revalidatePath('/compliance/inspection')
}

const ST_CHIP: Record<InspectionStatus, 'neutral' | 'warn' | 'info' | 'ok'> = {
  계획: 'neutral', 결과미등록: 'warn', 결재중: 'info', 완료: 'ok',
}

async function addPlan(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/inspection', 'BIZ_MGR', 'ADMIN')
  const itemId = String(formData.get('itemId') ?? '')
  const target = String(formData.get('target') ?? '').trim().slice(0, 60)
  const month = String(formData.get('month') ?? '')
  const inspector = String(formData.get('inspector') ?? '')
  const s = getStore()
  // 점검자는 셀렉트(비-USER 계정)와 동일 집합으로 검증 — 임의 POST 로 미등록·과대 문자열 저장 차단
  // 월은 달력상 유효월(01~12)만 — /^\d{4}-\d{2}$/ 는 2026-13·2026-00 을 통과시켜, 예정월이 어휘 비교
  // (경과 판정·notify 점검경과)에서 영구 경과(2026-00)·경과 누락(2026-13) 으로 오분류된다(임의 POST 대비).
  if (!s.inspectionItems.some((i) => i.id === itemId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !ACCOUNTS.some((a) => a.role !== 'USER' && a.name === inspector)) return
  const id = nextNo('IS', today().slice(0, 4), s.inspectionPlans.map((p) => p.id))
  s.inspectionPlans.unshift({ id, itemId, target: target || undefined, month, inspector, status: '계획' })
  // 상세점검계획표 등 계획 문서 — 계획번호(pk)로 계획·증적 첨부를 공유 (첨부 시트: 연간계획수립)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/compliance/inspection')
}

async function registerResult(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/inspection', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const result = String(formData.get('result') ?? '').trim().slice(0, 500)
  if (!result) return
  const s = getStore()
  const plan = s.inspectionPlans.find((p) => p.id === id && (p.status === '계획' || p.status === '결과미등록'))
  if (!plan) return
  plan.result = result
  plan.status = '결재중'
  // 증적자료 첨부 — 결재 문서(ref=계획번호)에서 함께 조회된다
  registerUpload(plan.id, formData.get('file'), me.name)

  // 폐쇄 루프 — 점검 결과·증적이 기본 결재선으로 흐르고, 승인되면 현황판 완료로 집계된다 (결재 시트 3번)
  const item = s.inspectionItems.find((i) => i.id === plan.itemId)
  draftApproval({ docType: '점검결과 상신', title: `[보안점검결과-점검항목] ${item?.control ?? plan.itemId} (${plan.month})`, ref: plan.id, drafter: me })
  // /compliance/inspection 은 공유 워크스페이스(BIZ_MGR·ADMIN) — 반려된 계획을 원 상신자와 다른 관리자가
  // 재상신하면 draftApproval 의 기안자-매칭 닫기(approvals.ts:66 owner 게이트)가 놓쳐 원 상신자의 '재상신'
  // 할일이 고아로 남고 '반려 방치' 알림이 무한 반복된다(SR submitApply·변경 closeChangeResignTodo 와 동일
  // 결함). 유형+계획번호 선두 고정으로 소유자 무관하게 닫아 폐쇄 루프를 만든다.
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[점검결과 상신] ${plan.id} `)) t.done = true
  }
  revalidatePath('/', 'layout')
}

export default async function InspectionPage() {
  await requireMenu('/compliance/inspection')
  const s = getStore()
  const thisMonth = today().slice(0, 7)
  const itemOf = (id: string) => s.inspectionItems.find((i) => i.id === id)

  const counts = {
    계획: s.inspectionPlans.filter((p) => p.status === '계획').length,
    결과미등록: s.inspectionPlans.filter((p) => p.status === '결과미등록').length,
    결재중: s.inspectionPlans.filter((p) => p.status === '결재중').length,
    완료: s.inspectionPlans.filter((p) => p.status === '완료').length,
  }
  const overdue = s.inspectionPlans.filter((p) => p.month < thisMonth && p.status !== '완료' && p.status !== '결재중')

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="보안점검 (ISMS)"
        desc="기준(Template) 관리 → 연간 점검계획 → 결과 등록·부서장 결재 → 현황판 집계 — ISMS·외부기관 점검 항목." />

      {/* 현황판식 숫자 표현 (요구사항: 계획·결과미등록·완료 등 항목 정의하여 숫자로) */}
      <div className="stat-row">
        <Stat value={counts.계획} label="계획" />
        <Stat value={counts.결과미등록} label="결과미등록" tone={counts.결과미등록 > 0 ? 'warn' : undefined} />
        <Stat value={counts.결재중} label="결재중" />
        <Stat value={counts.완료} label="완료" />
        <Stat value={overdue.length} label="기한 경과" tone={overdue.length > 0 ? 'err' : undefined} note={`기준월 ${thisMonth}`} />
      </div>

      <Card title="점검 진행내역" kicker="Progress" pad={false}
        actions={<a className="btn sm" href="/api/export?type=inspection-plans">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>계획번호</th><th>분류</th><th>점검 항목</th><th>대상</th><th>구분</th><th>예정월</th><th>점검자</th><th>상태</th><th className="c">결과 등록 · 결재</th></tr>
            </thead>
            <tbody>
              {s.inspectionPlans.map((p) => {
                const item = itemOf(p.itemId)
                const late = p.month < thisMonth && p.status !== '완료' && p.status !== '결재중'
                return (
                  <tr key={p.id}>
                    <td className="code">{p.id}</td>
                    <td><Chip tone="neutral" bare>{item?.category ?? '-'}</Chip></td>
                    <td className="strong">{item?.control ?? p.itemId}</td>
                    <td>{p.target ?? <span className="mut">-</span>}</td>
                    <td>{item?.source === 'ISMS' ? <Chip tone="info" bare>ISMS</Chip> : <Chip tone="warn" bare>외부기관</Chip>}</td>
                    <td className="tnum">{p.month} {late && <Chip tone="err" bare>경과</Chip>}</td>
                    <td>{p.inspector}</td>
                    <td><Chip tone={ST_CHIP[p.status]}>{p.status}</Chip></td>
                    <td className="c" style={{ maxWidth: 380 }}>
                      {(p.status === '계획' || p.status === '결과미등록') ? (
                        <form action={registerResult} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input aria-label="점검 결과" className="input" name="result" required maxLength={500} placeholder="점검 결과" style={{ height: 25, fontSize: 11.5, width: 160 }} />
                          <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 150, paddingTop: 2 }} title="증적자료 첨부" />
                          <button type="submit" className="btn sm pri">결과 결재상신</button>
                        </form>
                      ) : p.status === '결재중' ? (
                        <span className="mut">부서장 결재 대기<Clip count={attachCount(p.id)} title="증적자료" /></span>
                      ) : (
                        <span title={p.result} className="dim">{p.result}<Clip count={attachCount(p.id)} title="증적자료" /></span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="점검계획 수립" kicker="Plan">
          {/* 컨트롤 4개를 한 줄에 두면 c2 그리드 반폭에서 카드를 넘쳐 옆 카드 sticky 헤더에 가려진다 — 2행으로 나눈다 */}
          <form action={addPlan} className="vstack" style={{ gap: 7 }}>
            <select aria-label="점검 항목" className="select" name="itemId" required style={{ width: '100%' }}>
              {s.inspectionItems.map((i) => <option key={i.id} value={i.id}>[{i.category}] {i.control}</option>)}
            </select>
            <div className="hstack">
              <input aria-label="점검 대상" className="input" name="target" maxLength={60} placeholder="점검 대상 (조직·시스템)" style={{ flex: 1 }} />
              <input aria-label="월" className="input" name="month" required type="month" defaultValue={thisMonth} style={{ flex: 1 }} />
              <select aria-label="점검자" className="select" name="inspector" style={{ flex: 1 }}>
                {ACCOUNTS.filter((a) => a.role !== 'USER').map((a) => <option key={a.login} value={a.name}>{a.name}</option>)}
              </select>
              <input className="input" type="file" name="file" style={{ width: 140, paddingTop: 4 }} title="상세점검계획표 첨부" />
              <button type="submit" className="btn">계획 등록</button>
            </div>
          </form>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
            항목·주기는 기준관리(Template)에서 온다 — 전년 자료 복사·엑셀 업로드는 이후 버전.
          </div>
        </Card>

        <Card title="기준관리 — 점검 항목 (Template)" kicker="Criteria" pad={false}
          actions={<a className="btn sm" href="/api/export?type=inspection-items">엑셀 다운로드</a>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>대분류</th><th>중분류</th><th>통제 항목</th><th>주기</th><th>구분</th><th className="c">삭제</th></tr></thead>
              <tbody>
                {s.inspectionItems.map((i) => {
                  const inUse = s.inspectionPlans.some((p) => p.itemId === i.id)
                  return (
                    <tr key={i.id}>
                      <td className="code">{i.id}</td>
                      <td>{i.category}</td>
                      <td>{i.subCategory ?? <span className="mut">-</span>}</td>
                      <td className="strong">{i.control}</td>
                      <td><Chip tone="neutral" bare>{i.cycle}</Chip></td>
                      <td>{i.source}</td>
                      <td className="c">
                        {inUse ? (
                          <span className="mut" title="점검계획이 참조 중 — 삭제 불가">사용중</span>
                        ) : (
                          <form action={deleteItem} style={{ display: 'inline' }}>
                            <input type="hidden" name="id" value={i.id} />
                            <button type="submit" className="btn sm danger">삭제</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }} className="vstack">
            <form action={addItem} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
              <input aria-label="대분류" className="input" name="category" required maxLength={40} placeholder="대분류" style={{ width: 90, height: 26, fontSize: 11.5 }} />
              <input aria-label="중분류" className="input" name="subCategory" maxLength={40} placeholder="중분류" style={{ width: 90, height: 26, fontSize: 11.5 }} />
              <input aria-label="통제 항목" className="input" name="control" required maxLength={120} placeholder="통제 항목" style={{ flex: 1, minWidth: 150, height: 26, fontSize: 11.5 }} />
              <select aria-label="주기" className="select" name="cycle" style={{ height: 26, fontSize: 11.5 }}>
                {activeCycles(s).map((c) => <option key={c}>{c}</option>)}
              </select>
              <select aria-label="구분" className="select" name="source" style={{ height: 26, fontSize: 11.5 }}>
                {SOURCES.map((x) => <option key={x}>{x}</option>)}
              </select>
              <button type="submit" className="btn sm pri">기준 등록</button>
            </form>
            <form action={uploadItems} className="hstack" style={{ gap: 5, marginTop: 5 }}>
              <input className="input" type="file" name="file" required accept=".csv,.txt" style={{ flex: 1, height: 26, fontSize: 11, paddingTop: 3 }}
                title="CSV 업로드 — 대분류,통제항목,주기,구분[,중분류]" />
              <button type="submit" className="btn sm">업로드 반영</button>
            </form>
            <div className="dim" style={{ fontSize: 11 }}>
              주기 선택지는 공통코드 INSPECT_CYCLE — CSV 는 <span className="mono">대분류,통제항목,주기,구분[,중분류]</span> 형식, 중복 통제 항목은 건너뛴다.
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
