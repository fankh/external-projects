import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'

/** 재택근무 보안 점검 항목 — 공통코드화 대상 (등록 주기: 월) */
const ITEMS = [
  '업무용 PC 화면잠금(자리비움 시)을 설정했다.',
  '사내망 접속은 VPN을 통해서만 한다.',
  '회사 자료를 개인 기기·개인 클라우드로 반출하지 않았다.',
  '자택에서 업무 문서를 출력하지 않았다.',
  '화상회의 시 화면공유 범위를 확인하고 녹화하지 않았다.',
]

async function submitCheck(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  // 전 항목 동의 필수 — 서버에서 재검증
  if (ITEMS.some((_, i) => formData.get(`item${i}`) !== 'on')) return
  const s = getStore()
  const period = today().slice(0, 7)
  if (s.remoteChecks.some((r) => r.name === me.name && r.period === period)) return
  s.remoteChecks.push({ name: me.name, dept: me.dept, period, submittedAt: today() })

  // 폐쇄 루프 — 제출이 '재택 체크리스트' 할일을 닫는다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '재택 체크리스트' && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

export default async function RemotePage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const period = today().slice(0, 7)
  const canManage = me.role !== 'USER'

  const submitted = s.remoteChecks.filter((r) => r.period === period)
  const mySubmitted = submitted.find((r) => r.name === me.name)
  const scope = s.people.filter((p) => (me.role === 'DEPT_MGR' ? p.dept === me.dept : true))
  const missing = scope.filter((p) => !submitted.some((r) => r.name === p.name))

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="재택근무 체크리스트"
        desc={`${period} 재택근무 보안 자가점검 — 전 항목 확인 후 동의 제출한다 (등록 주기: 월).`}
        right={mySubmitted
          ? <Chip tone="ok">이번 달 제출 완료 · {mySubmitted.submittedAt}</Chip>
          : <Chip tone="warn">미제출</Chip>} />

      <div className="stat-row">
        <Stat value={submitted.length} label="이번 달 제출" note={`대상 ${s.people.length}명`} />
        <Stat value={s.people.length - submitted.length} label="미제출" tone={submitted.length < s.people.length ? 'warn' : undefined} />
        <Stat value={mySubmitted ? '완료' : '미제출'} label="내 제출 상태" tone={mySubmitted ? undefined : 'err'} />
      </div>

      {mySubmitted ? (
        <div className="callout">
          <b>제출 완료</b> — {mySubmitted.submittedAt} 제출. 다음 주기({period} 익월)에 다시 제출 대상이 됩니다.
        </div>
      ) : (
        <Card title={`${period} 자가점검 제출`} kicker="Checklist">
          <form action={submitCheck} className="vstack" style={{ gap: 8 }}>
            {ITEMS.map((item, i) => (
              <label key={item} className="hstack" style={{ gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" name={`item${i}`} required /> {item}
              </label>
            ))}
            <div className="hstack" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn pri">동의하고 제출</button>
            </div>
          </form>
        </Card>
      )}

      {canManage && (
        <Card title={me.role === 'DEPT_MGR' ? `${me.dept} 제출 현황` : '전사 제출 현황'} kicker="Status" pad={false}
          actions={missing.length > 0 ? <Chip tone="warn" bare>미제출 {missing.length}명</Chip> : <Chip tone="ok" bare>전원 제출</Chip>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>이름</th><th>부서</th><th>상태</th><th>제출일</th></tr></thead>
              <tbody>
                {scope.map((p) => {
                  const r = submitted.find((x) => x.name === p.name)
                  return (
                    <tr key={p.name}>
                      <td className="strong">{p.name}</td>
                      <td>{p.dept}</td>
                      <td>{r ? <Chip tone="ok" bare>제출</Chip> : <Chip tone="err" bare>미제출</Chip>}</td>
                      <td className="tnum">{r?.submittedAt ?? '-'}</td>
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
