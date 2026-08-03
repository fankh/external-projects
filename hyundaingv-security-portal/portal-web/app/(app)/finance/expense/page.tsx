import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerUpload } from '@/lib/attachments'
import { resubmitSettlement } from '../actions'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'
import type { SettlementItem } from '@/lib/types'

const fmt = (n: number) => n.toLocaleString('ko-KR')

async function addPlan(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const amount = Number(formData.get('amount'))
  if (!title || !Number.isFinite(amount) || amount <= 0) return
  const s = getStore()
  const year = today().slice(0, 4)
  s.investPlans.unshift({
    id: nextNo('IP', year, s.investPlans.map((p) => p.id)),
    kind: '비용', year, title, owner: me.name, dept: me.dept, amount: Math.round(amount), status: '작성중',
  })
  revalidatePath('/finance/expense')
}

async function confirmPlan(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const p = s.investPlans.find((x) => x.id === String(formData.get('id') ?? '') && x.kind === '비용')
  if (p && p.status === '작성중') p.status = '확정'
  revalidatePath('/finance/expense')
}

async function addContract(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const vendor = String(formData.get('vendor') ?? '').trim().slice(0, 60)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const amount = Number(formData.get('amount'))
  const planId = String(formData.get('planId') ?? '')
  if (!vendor || !title || !Number.isFinite(amount) || amount <= 0) return
  const s = getStore()
  const year = today().slice(0, 4)
  const id = nextNo('CT', year, s.investContracts.map((c) => c.id))
  s.investContracts.unshift({
    id, kind: '비용',
    planId: s.investPlans.some((p) => p.id === planId && p.kind === '비용') ? planId : undefined,
    vendor, title, amount: Math.round(amount), signedAt: today(),
  })
  // 계약별 부속서류(계약서·보안관리약정서 등) — 공통 첨부 (첨부 시트: 시행·계약입력)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/finance/expense')
}

async function addFlash(formData: FormData) {
  'use server'
  await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const month = String(formData.get('month') ?? '')
  const vendor = String(formData.get('vendor') ?? '').trim().slice(0, 60)
  const expected = Number(formData.get('expected'))
  const planId = String(formData.get('planId') ?? '')
  if (!/^\d{4}-\d{2}$/.test(month) || !vendor || !Number.isFinite(expected) || expected <= 0) return
  const s = getStore()
  s.expenseFlashes.unshift({
    id: nextNo('EF', today().slice(0, 4), s.expenseFlashes.map((f) => f.id)),
    month, vendor, expected: Math.round(expected),
    planId: s.investPlans.some((p) => p.id === planId && p.kind === '비용') ? planId : undefined,
  })
  revalidatePath('/finance/expense')
}

async function requestSettlement(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const contractId = String(formData.get('contractId') ?? '')
  const item = String(formData.get('item') ?? '') as SettlementItem
  const amount = Number(formData.get('amount'))
  const s = getStore()
  const contract = s.investContracts.find((c) => c.id === contractId && c.kind === '비용')
  if (!contract || !['월정산', '착수금', '중도금', '잔금'].includes(item) || !Number.isFinite(amount) || amount <= 0) return

  const year = today().slice(0, 4)
  const stId = nextNo('ST', year, s.settlements.map((x) => x.id))
  s.settlements.unshift({ id: stId, contractId, item, amount: Math.round(amount), status: '결재중', requestedBy: me.name, requestedAt: today() })
  // 정산 증빙(세금계산서·검수서 등) — 결재함 상세에서 같은 첨부를 본다 (첨부 시트: 정산품의)
  registerUpload(stId, formData.get('file'), me.name)

  // 폐쇄 루프 — 정산품의가 기본 결재선으로 흐르고, 승인되면 속보 기준금액이 '정산'으로 바뀐다
  draftApproval({ docType: '비용 정산품의', title: `[정산품의-비용] ${contract.title} ${item} ${fmt(Math.round(amount))}만원`, ref: stId, drafter: me })
  revalidatePath('/', 'layout')
}

export default async function ExpensePage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'

  const kindPlans = s.investPlans.filter((p) => p.kind === '비용')
  const kindContracts = s.investContracts.filter((c) => c.kind === '비용')
  const kindSettlements = s.settlements.filter((x) => kindContracts.some((c) => c.id === x.contractId))

  const plans = kindPlans.filter((p) =>
    me.role === 'USER' ? p.owner === me.name :
    me.role === 'DEPT_MGR' ? p.dept === me.dept : true,
  )
  const confirmed = kindPlans.filter((p) => p.status === '확정')

  const planTotal = confirmed.reduce((sum, p) => sum + p.amount, 0)
  const contractTotal = kindContracts.reduce((sum, c) => sum + c.amount, 0)
  const paidTotal = kindSettlements.filter((x) => x.status === '지급완료').reduce((sum, x) => sum + x.amount, 0)

  /** 속보 기준금액 — 정산 > 계약 > 계획 우선순위 (요구사항) */
  const basisOf = (f: { month: string; vendor: string; planId?: string; expected: number }) => {
    const paid = kindSettlements
      .filter((x) => x.status === '지급완료' && x.requestedAt.slice(0, 7) === f.month &&
        kindContracts.find((c) => c.id === x.contractId)?.vendor === f.vendor)
      .reduce((sum, x) => sum + x.amount, 0)
    if (paid > 0) return { basis: '정산' as const, amount: paid }
    if (kindContracts.some((c) => c.vendor === f.vendor)) return { basis: '계약' as const, amount: f.expected }
    return { basis: '계획' as const, amount: f.expected }
  }

  return (
    <>
      <ScreenHeader kicker="IT 투자/비용" title="비용 관리"
        desc="경영계획 → 시행·계약 → 속보(월별 지불 예상) → 정산품의(결재) — 기준금액은 정산 > 계약 > 계획 우선순위로 표시한다." />

      <div className="stat-row">
        <Stat value={<>{fmt(planTotal)}<small>만원</small></>} label="확정 계획" note={`항목 ${confirmed.length}건`} />
        <Stat value={<>{fmt(contractTotal)}<small>만원</small></>} label="계약 체결" note={`계약 ${kindContracts.length}건`} />
        <Stat value={<>{fmt(paidTotal)}<small>만원</small></>} label="집행 (지급완료)" />
        <Stat value={`${planTotal ? Math.round((paidTotal / planTotal) * 100) : 0}%`} label="계획 대비 집행률" />
      </div>

      <Card title="경영계획 — 비용 항목" kicker="Plan" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>항목번호</th><th>항목명</th><th>담당</th><th className="num">계획액 (만원)</th><th>상태</th>{canManage && <th className="c">확정</th>}</tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="code">{p.id}</td>
                  <td className="strong">{p.title}</td>
                  <td>{p.owner} <span className="mut">· {p.dept}</span></td>
                  <td className="num">{fmt(p.amount)}</td>
                  <td>{p.status === '확정' ? <Chip tone="ok">확정</Chip> : <Chip tone="neutral">작성중</Chip>}</td>
                  {canManage && (
                    <td className="c">
                      {p.status === '작성중' ? (
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
            <input className="input" name="title" required maxLength={120} placeholder="비용 항목명" style={{ flex: 1 }} />
            <input className="input" name="amount" required type="number" min={1} placeholder="계획액 (만원)" style={{ width: 140 }} />
            <button type="submit" className="btn">항목 등록</button>
          </form>
        </div>
      </Card>

      <Card title="속보 — 월별 거래처별 지불 예상" kicker="Flash" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>월</th><th>거래처</th><th>연결 항목</th><th className="num">예상액</th><th>기준</th><th className="num">기준금액</th></tr></thead>
            <tbody>
              {[...s.expenseFlashes].sort((a, b) => b.month.localeCompare(a.month)).map((f) => {
                const b = basisOf(f)
                return (
                  <tr key={f.id}>
                    <td className="tnum">{f.month}</td>
                    <td className="strong">{f.vendor}</td>
                    <td>{f.planId ? <span className="mono">{f.planId}</span> : <span className="mut">-</span>}</td>
                    <td className="num">{fmt(f.expected)}</td>
                    <td><Chip tone={b.basis === '정산' ? 'ok' : b.basis === '계약' ? 'info' : 'neutral'} bare>{b.basis}</Chip></td>
                    <td className="num strong">{fmt(b.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
          <form action={addFlash} className="hstack">
            <input className="input" name="month" required type="month" defaultValue={today().slice(0, 7)} />
            <input className="input" name="vendor" required maxLength={60} placeholder="거래처" style={{ flex: 1 }} />
            <select className="select" name="planId">
              <option value="">항목 연결 안 함</option>
              {confirmed.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
            </select>
            <input className="input" name="expected" required type="number" min={1} placeholder="예상액" style={{ width: 110 }} />
            <button type="submit" className="btn">속보 등록</button>
          </form>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="시행 · 계약내역" kicker="Contracts" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>계약번호</th><th>계약명</th><th>업체</th><th className="num">계약액</th><th>항목</th></tr></thead>
              <tbody>
                {kindContracts.map((c) => (
                  <tr key={c.id}>
                    <td className="code">{c.id}</td>
                    <td className="strong">{c.title}<Clip count={attachCount(c.id)} title="계약 부속서류" /></td>
                    <td>{c.vendor}</td>
                    <td className="num">{fmt(c.amount)}</td>
                    <td>{c.planId ? <span className="mono">{c.planId}</span> : <Chip tone="warn" bare>계획외</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px' }}>
            <form action={addContract} className="vstack" style={{ gap: 7 }}>
              <div className="hstack">
                <select className="select" name="planId" style={{ flex: 1 }}>
                  <option value="">항목 연결 안 함 (계획외)</option>
                  {confirmed.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
                </select>
                <input className="input" name="vendor" required maxLength={60} placeholder="업체" style={{ width: 120 }} />
              </div>
              <div className="hstack">
                <input className="input" name="title" required maxLength={120} placeholder="계약명" style={{ flex: 1 }} />
                <input className="input" name="amount" required type="number" min={1} placeholder="계약액" style={{ width: 110 }} />
                <input className="input" type="file" name="file" style={{ width: 170, paddingTop: 4 }} title="계약서·보안관리약정서 첨부" />
                <button type="submit" className="btn">계약 등록</button>
              </div>
            </form>
          </div>
        </Card>

        <Card title="정산품의 — 지급 항목" kicker="Settlement" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>품의번호</th><th>계약</th><th>항목</th><th className="num">금액</th><th>상태</th></tr></thead>
              <tbody>
                {kindSettlements.map((x) => (
                  <tr key={x.id}>
                    <td className="code">{x.id}</td>
                    <td>{kindContracts.find((c) => c.id === x.contractId)?.title ?? x.contractId}</td>
                    <td><Chip tone="neutral" bare>{x.item}</Chip></td>
                    <td className="num">{fmt(x.amount)}</td>
                    <td>
                      {x.status === '지급완료' ? <Chip tone="ok">지급완료</Chip> :
                       x.status === '결재중' ? <Chip tone="info">결재중</Chip> : <Chip tone="err">반려</Chip>}
                      {x.status === '반려' && x.requestedBy === me.name && (
                        <form action={resubmitSettlement} style={{ display: 'inline', marginLeft: 6 }}>
                          <input type="hidden" name="id" value={x.id} />
                          <button type="submit" className="btn sm">재상신</button>
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
              <select className="select" name="contractId" required style={{ flex: 1 }}>
                {kindContracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
              </select>
              <select className="select" name="item">
                <option>월정산</option><option>착수금</option><option>중도금</option><option>잔금</option>
              </select>
              <input className="input" name="amount" required type="number" min={1} placeholder="금액" style={{ width: 100 }} />
              <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="정산 증빙 첨부" />
              <button type="submit" className="btn pri">정산품의 상신</button>
            </form>
          </div>
        </Card>
      </div>
    </>
  )
}
