import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { ACCOUNTS } from '@/lib/session'
import { getStore, nextNo } from '@/lib/store'
import type { InspectionStatus } from '@/lib/types'

const ST_CHIP: Record<InspectionStatus, 'neutral' | 'warn' | 'info' | 'ok'> = {
  계획: 'neutral', 결과미등록: 'warn', 결재중: 'info', 완료: 'ok',
}

async function addPlan(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const itemId = String(formData.get('itemId') ?? '')
  const month = String(formData.get('month') ?? '')
  const inspector = String(formData.get('inspector') ?? '')
  const s = getStore()
  if (!s.inspectionItems.some((i) => i.id === itemId) || !/^\d{4}-\d{2}$/.test(month) || !inspector) return
  s.inspectionPlans.unshift({
    id: nextNo('IS', today().slice(0, 4), s.inspectionPlans.map((p) => p.id)),
    itemId, month, inspector, status: '계획',
  })
  revalidatePath('/compliance/inspection')
}

async function registerResult(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const result = String(formData.get('result') ?? '').trim().slice(0, 500)
  if (!result) return
  const s = getStore()
  const plan = s.inspectionPlans.find((p) => p.id === id && (p.status === '계획' || p.status === '결과미등록'))
  if (!plan) return
  plan.result = result
  plan.status = '결재중'

  // 폐쇄 루프 — 점검 결과·증적이 부서장 결재로 흐르고, 승인되면 현황판 완료로 집계된다 (결재 시트 3번)
  const item = s.inspectionItems.find((i) => i.id === plan.itemId)
  const year = today().slice(0, 4)
  const biz = ACCOUNTS.find((a) => a.role === 'BIZ_MGR')!
  const adm = ACCOUNTS.find((a) => a.role === 'ADMIN')!
  const approver = me.name === biz.name ? adm.name : biz.name
  const apId = nextNo('AP', year, s.approvals.map((a) => a.id))
  s.approvals.unshift({
    id: apId, docType: '점검결과 상신', title: `[보안점검결과-점검항목] ${item?.control ?? plan.itemId} (${plan.month})`,
    drafter: me.name, dept: me.dept, approver, status: '대기', draftedAt: today(), ref: plan.id,
  })
  s.todos.unshift({ id: nextNo('TD', year, s.todos.map((t) => t.id)), owner: approver, kind: '결재', title: `${apId} 결재 처리`, dueDate: today(), done: false })
  revalidatePath('/', 'layout')
}

export default async function InspectionPage() {
  await requireRole('BIZ_MGR', 'ADMIN')
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

      <Card title="점검 진행내역" kicker="Progress" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>계획번호</th><th>분류</th><th>점검 항목</th><th>구분</th><th>예정월</th><th>점검자</th><th>상태</th><th className="c">결과 등록 · 결재</th></tr>
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
                    <td>{item?.source === 'ISMS' ? <Chip tone="info" bare>ISMS</Chip> : <Chip tone="warn" bare>외부기관</Chip>}</td>
                    <td className="tnum">{p.month} {late && <Chip tone="err" bare>경과</Chip>}</td>
                    <td>{p.inspector}</td>
                    <td><Chip tone={ST_CHIP[p.status]}>{p.status}</Chip></td>
                    <td className="c" style={{ maxWidth: 380 }}>
                      {(p.status === '계획' || p.status === '결과미등록') ? (
                        <form action={registerResult} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input className="input" name="result" required maxLength={500} placeholder="점검 결과 · 증적" style={{ height: 25, fontSize: 11.5, width: 200 }} />
                          <button type="submit" className="btn sm pri">결과 결재상신</button>
                        </form>
                      ) : p.status === '결재중' ? (
                        <span className="mut">부서장 결재 대기</span>
                      ) : (
                        <span title={p.result} className="dim">{p.result}</span>
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
            <select className="select" name="itemId" required style={{ width: '100%' }}>
              {s.inspectionItems.map((i) => <option key={i.id} value={i.id}>[{i.category}] {i.control}</option>)}
            </select>
            <div className="hstack">
              <input className="input" name="month" required type="month" defaultValue={thisMonth} style={{ flex: 1 }} />
              <select className="select" name="inspector" style={{ flex: 1 }}>
                {ACCOUNTS.filter((a) => a.role !== 'USER').map((a) => <option key={a.login} value={a.name}>{a.name}</option>)}
              </select>
              <button type="submit" className="btn">계획 등록</button>
            </div>
          </form>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
            항목·주기는 기준관리(Template)에서 온다 — 전년 자료 복사·엑셀 업로드는 이후 버전.
          </div>
        </Card>

        <Card title="기준관리 — 점검 항목 (Template)" kicker="Criteria" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>대분류</th><th>통제 항목</th><th>주기</th><th>구분</th></tr></thead>
              <tbody>
                {s.inspectionItems.map((i) => (
                  <tr key={i.id}>
                    <td className="code">{i.id}</td>
                    <td>{i.category}</td>
                    <td className="strong">{i.control}</td>
                    <td><Chip tone="neutral" bare>{i.cycle}</Chip></td>
                    <td>{i.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
