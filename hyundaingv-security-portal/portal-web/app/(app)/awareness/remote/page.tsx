import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, isRemoteTargetIn } from '@/lib/store'
import type { Store } from '@/lib/store'

/** 재택근무 보안 점검 항목 — 공통코드화 대상 (등록 주기: 월) */
const ITEMS = [
  '업무용 PC 화면잠금(자리비움 시)을 설정했다.',
  '사내망 접속은 VPN을 통해서만 한다.',
  '회사 자료를 개인 기기·개인 클라우드로 반출하지 않았다.',
  '자택에서 업무 문서를 출력하지 않았다.',
  '화상회의 시 화면공유 범위를 확인하고 녹화하지 않았다.',
]

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** 대상자 반영 — 요구사항 54행: 시작일자가 있으면 신규 추가, 종료일자만 있으면 기존(진행중) 대상 수정 */
function applyTarget(s: Store, name: string, dept: string, startDate: string, endDate: string): '추가' | '종료' | null {
  if (startDate) {
    if (endDate && endDate < startDate) return null
    // 동일 (인원, 시작일) 중복 등록 금지 — 반복 제출로 명단이 불어나는 것을 막는다
    if (s.remoteTargets.some((t) => t.name === name && t.startDate === startDate)) return null
    // 같은 인원의 열린 기간이 있으면 새 시작 전일로 닫는다 — 기간 중복 방지
    for (const t of s.remoteTargets) {
      if (t.name === name && !t.endDate && t.startDate < startDate) t.endDate = startDate
    }
    s.remoteTargets.unshift({ name, dept, startDate, endDate: endDate || undefined })
    return '추가'
  }
  if (endDate) {
    const open = s.remoteTargets.find((t) => t.name === name && !t.endDate)
    if (!open || endDate < open.startDate) return null
    open.endDate = endDate
    return '종료'
  }
  return null
}

async function submitCheck(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/remote', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  // 전 항목 동의 필수 — 서버에서 재검증
  if (ITEMS.some((_, i) => formData.get(`item${i}`) !== 'on')) return
  const s = getStore()
  const period = today().slice(0, 7)
  // 재택 대상자만 제출 — 화면 숨김과 별개의 서버 가드 (요구사항 54행 명단 기준)
  if (!s.remoteTargets.some((t) => t.name === me.name && isRemoteTargetIn(t, period))) return
  if (s.remoteChecks.some((r) => r.name === me.name && r.period === period)) return
  s.remoteChecks.push({ name: me.name, dept: me.dept, period, submittedAt: today() })

  // 폐쇄 루프 — 제출이 '재택 체크리스트' 할일을 닫는다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '재택 체크리스트' && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

/** 대상자 등록·수정 — 담당·Admin (요구사항 54행) */
async function upsertTarget(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/remote', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const startDate = String(formData.get('startDate') ?? '')
  const endDate = String(formData.get('endDate') ?? '')
  if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) return
  const s = getStore()
  const person = s.people.find((p) => p.name === name)
  if (!person) return
  const applied = applyTarget(s, person.name, person.dept, startDate, endDate)
  if (!applied) return
  audit(me.name, '재택 대상자 변경', `${person.name} ${applied} (${startDate || '-'} ~ ${endDate || '계속'})`)
  revalidatePath('/', 'layout')
}

/** 일자별 대상자 업로드 — CSV(이름,시작일자[,종료일자]) 행 단위 반영 (요구사항 54행 업로드 통합) */
async function uploadTargets(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/remote', 'BIZ_MGR', 'ADMIN')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) return
  const s = getStore()
  let applied = 0
  // 행 수 상한 — 한 번의 업로드가 스토어를 무한정 불리거나 이벤트 루프를 점유하는 것을 막는다
  for (const line of (await file.text()).split(/\r?\n/).slice(0, 500)) {
    const [name = '', startDate = '', endDate = ''] = line.split(',').map((x) => x.trim())
    if (!name || (startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) continue
    const person = s.people.find((p) => p.name === name)
    if (!person) continue
    if (applyTarget(s, person.name, person.dept, startDate, endDate)) applied += 1
  }
  if (applied === 0) return
  audit(me.name, '재택 대상자 변경', `업로드 ${applied}건 반영 (${file.name.slice(0, 60)})`)
  revalidatePath('/', 'layout')
}

export default async function RemotePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await requireMenu('/awareness/remote')
  const { period: periodParam } = await searchParams
  const s = getStore()
  const thisMonth = today().slice(0, 7)
  // 기간별 조회 (요구사항 54행) — 담당은 과거 월을 지정해 명단·제출을 함께 본다
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? '') ? periodParam! : thisMonth
  const canManage = me.role !== 'USER'

  const submitted = s.remoteChecks.filter((r) => r.period === period)
  const mySubmitted = s.remoteChecks.find((r) => r.name === me.name && r.period === thisMonth)
  const iAmTarget = s.remoteTargets.some((t) => t.name === me.name && isRemoteTargetIn(t, thisMonth))

  // 현황 스코프 — 해당 월 재택 대상자 명단 (부서담당은 소속 부서만)
  const targets = s.remoteTargets.filter((t) =>
    isRemoteTargetIn(t, period) && (me.role !== 'DEPT_MGR' || t.dept === me.dept))
  const missing = targets.filter((t) => !submitted.some((r) => r.name === t.name))

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="재택근무 체크리스트"
        desc={`재택근무 대상자의 보안 자가점검 — 전 항목 확인 후 동의 제출한다 (등록 주기: 월, 명단은 일자별 관리).`}
        right={!iAmTarget
          ? <Chip tone="neutral">재택 대상 아님</Chip>
          : mySubmitted
            ? <Chip tone="ok">이번 달 제출 완료 · {mySubmitted.submittedAt}</Chip>
            : <Chip tone="warn">미제출</Chip>} />

      <div className="stat-row">
        <Stat value={submitted.length} label={`${period} 제출`} note={`대상 ${targets.length}명`} />
        <Stat value={missing.length} label="미제출" tone={missing.length > 0 ? 'warn' : undefined} />
        <Stat value={!iAmTarget ? '대상 아님' : mySubmitted ? '완료' : '미제출'} label="내 제출 상태"
          tone={!iAmTarget || mySubmitted ? undefined : 'err'} />
      </div>

      {!iAmTarget ? (
        <div className="callout">
          <b>재택 대상 아님</b> — 이번 달({thisMonth}) 재택근무 대상자 명단에 없어 체크리스트 제출 대상이 아닙니다.
          재택 시작 시 담당자가 명단에 등록하면 제출할 수 있습니다.
        </div>
      ) : mySubmitted ? (
        <div className="callout">
          <b>제출 완료</b> — {mySubmitted.submittedAt} 제출. 다음 주기({thisMonth} 익월)에 다시 제출 대상이 됩니다.
        </div>
      ) : (
        <Card title={`${thisMonth} 자가점검 제출`} kicker="Checklist">
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
          actions={
            <span className="hstack">
              <form method="get" className="hstack" style={{ gap: 4 }}>
                <input className="input" type="month" name="period" defaultValue={period}
                  title="조회 월 — 해당 월 재택 대상 명단 기준" style={{ height: 25, fontSize: 11, width: 118 }} />
                <button type="submit" className="btn sm">기간 조회</button>
              </form>
              {missing.length > 0 ? <Chip tone="warn" bare>미제출 {missing.length}명</Chip> : <Chip tone="ok" bare>전원 제출</Chip>}
              <a className="btn sm" href={`/api/export?type=remote-status&period=${period}`}>엑셀 다운로드</a>
            </span>
          }>
          {targets.length === 0 ? (
            <div className="empty">{period} 재택근무 대상자가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>이름</th><th>부서</th><th>재택기간</th><th>상태</th><th>제출일</th></tr></thead>
                <tbody>
                  {targets.map((t) => {
                    const r = submitted.find((x) => x.name === t.name)
                    return (
                      <tr key={`${t.name}-${t.startDate}`}>
                        <td className="strong">{t.name}</td>
                        <td>{t.dept}</td>
                        <td className="tnum">{`${t.startDate} ~ ${t.endDate ?? '계속'}`}</td>
                        <td>{r ? <Chip tone="ok" bare>제출</Chip> : <Chip tone="err" bare>미제출</Chip>}</td>
                        <td className="tnum">{r?.submittedAt ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {(me.role === 'BIZ_MGR' || me.role === 'ADMIN') && (
        <Card title="대상자 관리 — 일자별 명단" kicker="Targets">
          <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>
            시작일자를 넣으면 신규 등록(기존 열린 기간은 전일로 마감), 종료일자만 넣으면 진행중 대상의 재택 종료 처리.
            업로드는 CSV 한 줄에 <span className="mono">이름,시작일자[,종료일자]</span> — 같은 규칙으로 행 단위 반영된다.
          </div>
          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap' }}>
            <form action={upsertTarget} className="hstack">
              <select className="select" name="name" required>
                {s.people.map((p) => <option key={p.name} value={p.name}>{p.name} · {p.dept}</option>)}
              </select>
              <input className="input" type="date" name="startDate" title="재택 시작일 — 신규 등록" style={{ width: 130 }} />
              <input className="input" type="date" name="endDate" title="재택 종료일 — 단독 입력 시 종료 처리" style={{ width: 130 }} />
              <button type="submit" className="btn pri">반영</button>
            </form>
            <form action={uploadTargets} className="hstack">
              <input className="input" type="file" name="file" required accept=".csv,.txt" style={{ width: 200, paddingTop: 4 }} title="대상자 CSV 업로드" />
              <button type="submit" className="btn">업로드 반영</button>
            </form>
          </div>
        </Card>
      )}
    </>
  )
}
