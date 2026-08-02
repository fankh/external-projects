import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { requireRole } from '@/lib/authz'
import { nowStamp, today } from '@/lib/dates'
import { secdataAdapter } from '@/lib/integrations/registry'
import { getStore, nextNo, recordBatch } from '@/lib/store'

/** 전일자 이관 — 보안·출력물 시스템(DB 연계) 자료를 일배치로 가져온다 (요구사항: 일배치 이관) */
async function importDaily() {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const adapter = secdataAdapter()
  if (!adapter) {
    recordBatch('출력물 자료 일배치 이관 (수동)', nowStamp(), '실패')
    revalidatePath('/', 'layout')
    return
  }
  const rows = await adapter.fetchPrintouts()
  const year = today().slice(0, 4)
  let added = 0
  for (const row of rows) {
    if (s.printouts.some((p) => p.printedAt === row.printedAt && p.name === row.name && p.document === row.document)) continue
    s.printouts.push({
      id: nextNo('PR', year, s.printouts.map((p) => p.id)),
      ...row, status: '미등록',
    })
    added += 1
  }
  recordBatch(`출력물 자료 일배치 이관 (수동, ${added}건)`, nowStamp(), '성공')
  audit(me.name, '일배치 이관', `출력물 자료 ${added}건 (보안·출력물 시스템)`)
  revalidatePath('/', 'layout')
}

async function registerDiscard(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const method = String(formData.get('method') ?? '')
  if (method !== '세단' && method !== '소각') return
  const s = getStore()
  // 본인 자료만 등록 가능 (요구사항: 본인으로 변경)
  const row = s.printouts.find((p) => p.id === id && p.name === me.name && p.status === '미등록')
  if (!row) return
  row.method = method
  row.discardedAt = today()
  row.status = '등록'
  revalidatePath('/awareness/prints')
}

async function submitDiscards() {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  // 본인 자료 중 폐기 등록 완료 건 전체를 상신 (결재 시트 13번 — 본인자료만 상신 가능)
  const targets = s.printouts.filter((p) => p.name === me.name && p.status === '등록')
  if (targets.length === 0) return

  const year = today().slice(0, 4)
  const ref = nextNo('PD', year, s.printouts.map((p) => p.approvalRef).filter((x): x is string => Boolean(x)))
  for (const row of targets) {
    row.approvalRef = ref
    row.status = '결재중'
  }
  draftApproval({ docType: '출력물폐기 상신', title: `[출력물폐기] ${me.name} ${targets.length}건 (${today()})`, ref, drafter: me })

  // 폐쇄 루프 — 상신과 함께 내 '출력물 폐기확인' 할일이 닫힌다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '출력물 폐기확인' && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

export default async function PrintsPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const channelOn = Boolean(secdataAdapter())

  // 스코핑 — 사용자: 본인 / 부서담당: 부서 / 업무담당·Admin: 전사
  const rows = s.printouts.filter((p) =>
    me.role === 'USER' ? p.name === me.name :
    me.role === 'DEPT_MGR' ? p.dept === me.dept : true,
  )
  const mine = s.printouts.filter((p) => p.name === me.name)
  const myReady = mine.filter((p) => p.status === '등록')

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="출력물 개인정보관리"
        desc="보안·출력물 시스템에서 전일자 자료를 일배치 이관 → 본인 폐기 등록 → 출력물폐기 결재상신." />

      <div className="stat-row">
        <Stat value={channelOn ? '가동중' : '중지'} label="보안·출력물 채널" tone={channelOn ? undefined : 'err'} />
        <Stat value={rows.length} label="이관 자료" />
        <Stat value={rows.filter((p) => p.status === '미등록').length} label="폐기 미등록" tone={rows.some((p) => p.status === '미등록') ? 'warn' : undefined} />
        <Stat value={rows.filter((p) => p.status === '폐기확정').length} label="폐기확정" />
      </div>

      {!channelOn && (
        <div className="callout warn">
          <b>보안·출력물 시스템 채널이 중지 상태입니다</b> — 일배치 이관이 실행되지 않습니다.{' '}
          {me.role === 'ADMIN'
            ? <Link href="/platform/integrations">연동 · 인프라</Link>
            : 'Admin에게 채널 가동을 요청하세요.'}
        </div>
      )}

      <Card title="출력물 목록" kicker="Printouts" pad={false}
        actions={
          <span className="hstack">
            {canManage && (
              <form action={importDaily}>
                <button type="submit" className="btn sm" disabled={!channelOn}>전일자 이관 실행</button>
              </form>
            )}
            {myReady.length > 0 && (
              <form action={submitDiscards}>
                <button type="submit" className="btn sm pri">내 폐기현황 결재상신 ({myReady.length}건)</button>
              </form>
            )}
          </span>
        }>
        {rows.length === 0 ? (
          <div className="empty">이관된 출력물 자료가 없습니다{canManage && channelOn ? ' — 전일자 이관을 실행하세요' : ''}.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>출력 일시</th><th>출력자</th><th>문서</th><th className="num">쪽수</th><th>개인정보</th><th>폐기 등록</th><th>상태</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="code">{p.id}</td>
                    <td className="tnum">{p.printedAt}</td>
                    <td>{p.name} <span className="mut">· {p.dept}</span></td>
                    <td className="strong">{p.document}</td>
                    <td className="num">{p.pages}</td>
                    <td>{p.personalInfo ? <Chip tone="err" bare>포함</Chip> : <span className="mut">-</span>}</td>
                    <td style={{ maxWidth: 260 }}>
                      {p.status === '미등록' && p.name === me.name ? (
                        <form action={registerDiscard} className="hstack" style={{ padding: '3px 0' }}>
                          <input type="hidden" name="id" value={p.id} />
                          <select className="select" name="method" style={{ height: 25, fontSize: 11.5 }}>
                            <option>세단</option><option>소각</option>
                          </select>
                          <button type="submit" className="btn sm">폐기 등록</button>
                        </form>
                      ) : p.method ? (
                        <span className="dim">{p.method} · {p.discardedAt}</span>
                      ) : (
                        <span className="mut">본인만 등록 가능</span>
                      )}
                    </td>
                    <td>
                      {p.status === '폐기확정' ? <Chip tone="ok">폐기확정</Chip> :
                       p.status === '결재중' ? <Chip tone="info">결재중</Chip> :
                       p.status === '등록' ? <Chip tone="neutral">등록</Chip> : <Chip tone="warn">미등록</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>처리 절차</b> — 전일자 출력물이 일배치로 이관되면 본인이 폐기 방법·일자를 등록하고, 등록 건을 모아
        결재상신한다(본인 자료만 상신 가능). 승인되면 폐기확정으로 집계된다.
      </div>
    </>
  )
}
