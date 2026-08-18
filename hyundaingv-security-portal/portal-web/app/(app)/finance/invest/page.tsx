import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { resubmitSettlement } from '../actions'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { computeFinanceKpis, planBasisAmount } from '@/lib/finance'
import { getStore, nextNo } from '@/lib/store'
import type { SettlementItem } from '@/lib/types'

const fmt = (n: number) => n.toLocaleString('ko-KR')

async function addPlan(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/finance/invest', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const amount = Number(formData.get('amount'))
  if (!title || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return
  const s = getStore()
  const year = today().slice(0, 4)
  s.investPlans.unshift({
    id: nextNo('IP', year, s.investPlans.map((p) => p.id)),
    kind: '투자', year, title, owner: me.name, dept: me.dept, amount: Math.round(amount), status: '작성중',
  })
  revalidatePath('/finance/invest')
}

/** 취합 제출 — 작성자 본인이 계획을 담당 취합 단계로 넘긴다 (제품안내서 III장) */
async function submitPlanDraft(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/finance/invest', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const p = s.investPlans.find((x) => x.id === String(formData.get('id') ?? '') && x.kind === '투자')
  if (p && p.status === '작성중' && p.owner === me.name) p.status = '취합'
  revalidatePath('/finance/invest')
}

/** 효율화 — 담당이 취합 건을 검토하며 금액을 조정한다 (미입력 시 유지) */
async function optimizePlan(formData: FormData) {
  'use server'
  await requireMenuRole('/finance/invest', 'BIZ_MGR', 'ADMIN')
  const amount = Number(formData.get('amount'))
  const s = getStore()
  const p = s.investPlans.find((x) => x.id === String(formData.get('id') ?? '') && x.kind === '투자')
  if (!p || p.status !== '취합') return
  if (Number.isFinite(amount) && amount > 0 && amount <= 1e9) p.amount = Math.round(amount)
  p.status = '효율화'
  revalidatePath('/finance/invest')
}

async function confirmPlan(formData: FormData) {
  'use server'
  await requireMenuRole('/finance/invest', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const p = s.investPlans.find((x) => x.id === String(formData.get('id') ?? '') && x.kind === '투자')
  // 효율화를 거친 계획만 확정한다 — 취합·효율화 단계 우회 차단 (제품안내서 III장)
  if (p && p.status === '효율화') p.status = '확정'
  revalidatePath('/finance/invest')
}

async function addContract(formData: FormData) {
  'use server'
  // 계약 등록은 전사 재무(계약 카드=canViewFinance 섹션)라 USER 제외 — 화면 섹션 가드와 액션 가드를
  // 일치시킨다(정산 상신 requestSettlement 와 동일 DEPT_MGR+). USER 는 직접 POST 로도 전사 계약을 못 만든다.
  const me = await requireMenuRole('/finance/invest', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const vendor = String(formData.get('vendor') ?? '').trim().slice(0, 60)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const amount = Number(formData.get('amount'))
  const planId = String(formData.get('planId') ?? '')
  if (!vendor || !title || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return
  const s = getStore()
  const year = today().slice(0, 4)
  const id = nextNo('CT', year, s.investContracts.map((c) => c.id))
  s.investContracts.unshift({
    id, kind: '투자',
    planId: s.investPlans.some((p) => p.id === planId && p.kind === '투자') ? planId : undefined,
    vendor, title, amount: Math.round(amount), signedAt: today(),
  })
  // 계약별 부속서류 (계약서·보안관리약정서 등) — 공통 첨부로 묶인다
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/finance/invest')
}

async function requestSettlement(formData: FormData) {
  'use server'
  // 정산 상신은 재무 리포트(정산 카드)와 동일 스코프 — 일반 사용자 제외, 부서담당 이상만
  const me = await requireMenuRole('/finance/invest', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const contractId = String(formData.get('contractId') ?? '')
  const item = String(formData.get('item') ?? '') as SettlementItem
  const amount = Number(formData.get('amount'))
  const s = getStore()
  const contract = s.investContracts.find((c) => c.id === contractId && c.kind === '투자')
  if (!contract || !['착수금', '중도금', '잔금'].includes(item) || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return

  const year = today().slice(0, 4)
  const stId = nextNo('ST', year, s.settlements.map((x) => x.id))
  // 임시저장 (제품안내서 II장 공통 흐름) — 상신 없이 작성중 보관
  const isDraft = formData.get('mode') === 'draft'
  // 결재 대기 중복 방지 — 같은 계약·항목·금액의 정산품의가 이미 결재중이면 무시한다. 더블클릭·재전송으로 동일
  // 정산이 이중 상신→이중 지급완료되어 집행액이 겹계상(집행률·계획대비실적 왜곡)되는 것을 차단(협력업체 서약·
  // 인프라 변경 징구 dedup 과 동일 정책). 결재가 끝나(지급완료·반려) 대기 건이 없으면 새 정산은 정상 진행된다.
  if (!isDraft && s.settlements.some((x) => x.contractId === contractId && x.item === item && x.amount === Math.round(amount) && x.status === '결재중')) return
  const dueDate = String(formData.get('dueDate') ?? '')
  s.settlements.unshift({ id: stId, contractId, item, amount: Math.round(amount), status: isDraft ? '작성중' : '결재중', requestedBy: me.name, requestedAt: today(),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined })
  // 정산 증빙 — 결재함 상세에서 같은 첨부를 본다 (첨부 시트: 정산품의)
  registerUpload(stId, formData.get('file'), me.name)

  // 폐쇄 루프 — 정산품의 상신이 기본 결재선으로 흐르고, 승인되면 지급완료로 실적에 반영된다
  if (!isDraft) draftApproval({ docType: '투자 정산품의', title: `[정산품의-투자] ${contract.title} ${item} ${fmt(Math.round(amount))}만원`, ref: stId, drafter: me })

  revalidatePath('/', 'layout')
}

export default async function InvestPage() {
  const me = await requireMenu('/finance/invest')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  // 재무 리포트(전사 집계·계약·정산·계획대비실적)는 관리자급(부서담당 이상)만 — 일반 사용자는
  // 본인 경영계획만 본다. 회사 전체 재무를 일반 직원이 열람하지 않도록 잠근다.
  const canViewFinance = me.role !== 'USER'

  const kindPlans = s.investPlans.filter((p) => p.kind === '투자')
  const kindContracts = s.investContracts.filter((c) => c.kind === '투자')
  const kindSettlements = s.settlements.filter((x) => kindContracts.some((c) => c.id === x.contractId))

  // 데이터 스코핑 — 경영계획은 개인별 작성: 사용자=본인, 부서담당=부서, 업무담당·Admin=전사
  const plans = kindPlans.filter((p) =>
    me.role === 'USER' ? p.owner === me.name :
    me.role === 'DEPT_MGR' ? p.dept === me.dept : true,
  )
  const confirmed = kindPlans.filter((p) => p.status === '확정')

  const paidOf = (contractId: string) =>
    s.settlements.filter((x) => x.contractId === contractId && x.status === '지급완료').reduce((sum, x) => sum + x.amount, 0)
  const contractsOf = (planId: string) => kindContracts.filter((c) => c.planId === planId)

  // 집행 KPI 는 lib/finance 단일 원천(비용 화면·IT운영 종합 export 와 같은 산식) — 표와 같은 컬렉션으로 산출
  const fin = computeFinanceKpis(kindPlans, kindContracts, kindSettlements)

  return (
    <>
      <ScreenHeader kicker="IT 투자/비용" title="투자 관리"
        desc="경영계획(투자과제) → 시행·계약 → 정산품의(결재) → 계획대비실적 — 집행 전 주기를 다룬다." />

      {canViewFinance && (
        <div className="stat-row">
          <Stat value={<>{fmt(fin.planTotal)}<small>만원</small></>} label="확정 계획" note={`과제 ${confirmed.length}건`} />
          <Stat value={<>{fmt(fin.contractTotal)}<small>만원</small></>} label="계약 체결" note={`계약 ${kindContracts.length}건`} />
          <Stat value={<>{fmt(fin.paidTotal)}<small>만원</small></>} label="집행 (지급완료)" />
          <Stat value={`${fin.execRate}%`} label="계획 대비 집행률" tone={fin.planTotal > 0 && fin.paidConfirmed > fin.planTotal ? 'err' : undefined} />
        </div>
      )}

      <Card title="경영계획 — 투자과제" kicker="Plan" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>과제번호</th><th>과제명</th><th>담당</th><th className="num">계획액 (만원)</th><th>상태</th>{canManage && <th className="c">확정</th>}</tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="code">{p.id}</td>
                  <td className="strong">{p.title}</td>
                  <td>{p.owner} <span className="mut">· {p.dept}</span></td>
                  <td className="num">{fmt(p.amount)}</td>
                  <td>
                    {p.status === '확정' ? <Chip tone="ok">확정</Chip> :
                    p.status === '효율화' ? <Chip tone="info">효율화</Chip> :
                    p.status === '취합' ? <Chip tone="warn">취합</Chip> : <Chip tone="neutral">작성중</Chip>}
                    {p.status === '작성중' && p.owner === me.name && (
                      <form action={submitPlanDraft} style={{ display: 'inline', marginLeft: 6 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="btn sm">취합 제출</button>
                      </form>
                    )}
                  </td>
                  {canManage && (
                    <td className="c">
                      {p.status === '취합' ? (
                        <form action={optimizePlan} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input className="input" name="amount" type="number" min={1} placeholder={String(p.amount)} title="효율화 조정액 (미입력 시 유지)" style={{ height: 25, fontSize: 11.5, width: 80 }} />
                          <button type="submit" className="btn sm pri">효율화</button>
                        </form>
                      ) : p.status === '효율화' ? (
                        <form action={confirmPlan} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="btn sm pri">계획 확정</button>
                        </form>
                      ) : <span className="mut">-</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
          <form action={addPlan} className="hstack">
            <input aria-label="투자과제명" className="input" name="title" required maxLength={120} placeholder="투자과제명" style={{ flex: 1 }} />
            <input aria-label="계획액" className="input" name="amount" required type="number" min={1} placeholder="계획액 (만원)" style={{ width: 140 }} />
            <button type="submit" className="btn">과제 등록</button>
          </form>
        </div>
      </Card>

      {canViewFinance && (
      <div className="cols c2">
        <Card title="시행 · 계약내역" kicker="Contracts" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>계약번호</th><th>계약명</th><th>업체</th><th className="num">계약액</th><th>과제</th></tr></thead>
              <tbody>
                {kindContracts.map((c) => (
                  <tr key={c.id}>
                    <td className="code">{c.id}</td>
                    <td className="strong">{c.title}<Clip count={attachCount(c.id)} title="계약서·부속서류" /></td>
                    <td>{c.vendor}</td>
                    <td className="num">{fmt(c.amount)}</td>
                    <td>
                      {c.planId ? <span className="mono">{c.planId}</span> : <Chip tone="warn" bare>계획외</Chip>}
                      {/* 계약 합계가 계획액을 넘으면 초과 표시 (요구사항: 초과 건 처리 가능 + 드러나야 한다) */}
                      {(() => {
                        const plan = c.planId ? kindPlans.find((p) => p.id === c.planId) : undefined
                        if (!plan) return null
                        const total = kindContracts.filter((x) => x.planId === c.planId).reduce((sum, x) => sum + x.amount, 0)
                        return total > plan.amount ? <Chip tone="err" bare>계획 초과</Chip> : null
                      })()}
                      {/* 지급(집행)이 계약액을 넘으면 초과지급 표시 — 계약 대비 정산 초과도 드러나게 (감사 F3) */}
                      {paidOf(c.id) > c.amount ? <Chip tone="err" bare>계약 초과</Chip> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addContract} className="vstack" style={{ gap: 7 }}>
              <div className="hstack">
                <select aria-label="연결 항목" className="select" name="planId" style={{ flex: 1 }}>
                  <option value="">과제 연결 안 함 (계획외)</option>
                  {confirmed.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
                </select>
                <input aria-label="업체" className="input" name="vendor" required maxLength={60} placeholder="업체" style={{ width: 120 }} />
              </div>
              <div className="hstack">
                <input aria-label="계약명" className="input" name="title" required maxLength={120} placeholder="계약명" style={{ flex: 1 }} />
                <input aria-label="계약액" className="input" name="amount" required type="number" min={1} placeholder="계약액" style={{ width: 110 }} />
                <input className="input" type="file" name="file" style={{ width: 180, paddingTop: 4 }} title="계약서·부속서류" />
                <button type="submit" className="btn">계약 등록</button>
              </div>
            </form>
          </div>
        </Card>

        <Card title="정산품의 — 지급 항목" kicker="Settlement" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>품의번호</th><th>계약</th><th>항목</th><th className="num">금액</th><th>지급예정</th><th>상태</th></tr></thead>
              <tbody>
                {kindSettlements.map((x) => (
                  <tr key={x.id}>
                    <td className="code">{x.id}</td>
                    <td>{s.investContracts.find((c) => c.id === x.contractId)?.title ?? x.contractId}</td>
                    <td><Chip tone="neutral" bare>{x.item}</Chip></td>
                    <td className="num">{fmt(x.amount)}</td>
                    <td className="tnum">{x.dueDate ?? '-'}</td>
                    <td>
                      {x.status === '지급완료' ? <Chip tone="ok">지급완료</Chip> :
                       x.status === '결재중' ? <Chip tone="info">결재중</Chip> :
                       x.status === '작성중' ? <Chip tone="neutral">작성중</Chip> : <Chip tone="err">반려</Chip>}
                      {(x.status === '반려' || x.status === '작성중') && x.requestedBy === me.name && (
                        <form action={resubmitSettlement} style={{ display: 'inline', marginLeft: 6 }}>
                          <input type="hidden" name="id" value={x.id} />
                          <button type="submit" className="btn sm">{x.status === '반려' ? '재상신' : '상신'}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={requestSettlement} className="hstack">
              <select aria-label="계약" className="select" name="contractId" required style={{ flex: 1 }}>
                {kindContracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
              </select>
              <select aria-label="지급 항목" className="select" name="item">
                <option>착수금</option><option>중도금</option><option>잔금</option>
              </select>
              <input aria-label="금액" className="input" name="amount" required type="number" min={1} placeholder="금액" style={{ width: 100 }} />
              <input className="input" name="dueDate" type="date" title="지급 예정일 — 지급 목록 일정 관리" style={{ width: 130 }} />
              <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="정산 증빙 첨부" />
              <button type="submit" name="mode" value="draft" className="btn">임시저장</button>
              <button type="submit" className="btn pri">정산품의 상신</button>
            </form>
          </div>
        </Card>
      </div>
      )}

      {canViewFinance && (
      <Card title="계획대비실적" kicker="Plan vs Actual" pad={false}
        actions={<a className="btn sm" href="/api/export?type=invest-actual">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>과제</th><th className="num">계획액</th><th className="num">계약액</th><th className="num">집행액</th><th className="num" title="정산 &gt; 계약 &gt; 계획 우선순위">기준액</th><th className="num">집행률</th></tr>
            </thead>
            <tbody>
              {confirmed.map((p) => {
                const cts = contractsOf(p.id)
                const contracted = cts.reduce((sum, c) => sum + c.amount, 0)
                const paid = cts.reduce((sum, c) => sum + paidOf(c.id), 0)
                const rate = p.amount ? Math.round((paid / p.amount) * 100) : 0
                // 기준액 — 정산>계약>계획 우선순위 (요구사항). lib/finance 단일 원천으로 산출한다.
                const b = planBasisAmount(p, kindContracts, kindSettlements)
                return (
                  <tr key={p.id}>
                    <td className="strong">{p.title} <span className="mut mono">{p.id}</span></td>
                    <td className="num">{fmt(p.amount)}</td>
                    <td className="num">{fmt(contracted)}</td>
                    <td className="num">{fmt(paid)}</td>
                    <td className="num"><Chip tone={b.basis === '정산' ? 'ok' : b.basis === '계약' ? 'info' : 'neutral'} bare>{b.basis}</Chip> {fmt(b.amount)}</td>
                    <td className="num"><Chip tone={rate > 100 ? 'err' : rate >= 90 ? 'warn' : 'neutral'} bare>{rate}%</Chip></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </>
  )
}
