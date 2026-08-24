import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, isRemoteTargetIn, remotePeriodKey } from '@/lib/store'
import type { Store } from '@/lib/store'
import { REMOTE_CYCLES, type RemoteCycle } from '@/lib/types'

/** 재택근무 보안 점검 항목 — 공통코드화 대상 (등록 주기: 매일·월·분기·반기 설정, s.remoteCycle) */
const ITEMS = [
  '업무용 PC 화면잠금(자리비움 시)을 설정했다.',
  '사내망 접속은 VPN을 통해서만 한다.',
  '회사 자료를 개인 기기·개인 클라우드로 반출하지 않았다.',
  '자택에서 업무 문서를 출력하지 않았다.',
  '화상회의 시 화면공유 범위를 확인하고 녹화하지 않았다.',
]

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** 달력상 실재하는 날짜인가 — DATE 정규식은 2026-13-45·2026-02-30 같은 비현실 날짜를 통과시키는데,
 *  dayBefore 의 new Date(NaN).toISOString() 가 RangeError 로 서버액션을 500 낸다. UTC 파싱 왕복으로 검증
 *  (02-30 은 03-01 로 롤오버되어 왕복이 달라지므로 거부). */
function realDate(d: string): boolean {
  const p = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d
}

/** 대상자 반영 — 요구사항 54행: 시작일자가 있으면 신규 추가, 종료일자만 있으면 기존(진행중) 대상 수정 */
function applyTarget(s: Store, name: string, dept: string, startDate: string, endDate: string): '추가' | '종료' | null {
  if ((startDate && !realDate(startDate)) || (endDate && !realDate(endDate))) return null
  if (startDate) {
    if (endDate && endDate < startDate) return null
    // 동일 (인원, 시작일) 중복 등록 금지 — 반복 제출로 명단이 불어나는 것을 막는다
    if (s.remoteTargets.some((t) => t.name === name && t.startDate === startDate)) return null
    // 새 시작 이후(또는 같은 날)에 시작한 열린 기간이 이미 있으면 두 기간이 겹친다 — 한 사람이 동시에
    // 두 재택 기간을 가질 수 없으므로(순서 뒤바뀐 등록·CSV로 열린 기간이 둘 생기던 결함) 추가를 거부한다.
    if (s.remoteTargets.some((t) => t.name === name && !t.endDate && t.startDate >= startDate)) return null
    // 같은 인원의 (더 이른) 열린 기간이 있으면 새 시작 '전일'로 닫는다 — endDate 는 포함이므로 신규
    // 시작일 당일로 닫으면(=startDate) 그 달에 구/신 기간이 둘 다 잡혀 이중 집계된다(off-by-one).
    const dayBefore = new Date(Date.parse(startDate) - 86400000).toISOString().slice(0, 10)
    for (const t of s.remoteTargets) {
      if (t.name === name && !t.endDate && t.startDate < startDate) t.endDate = dayBefore
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
  const period = remotePeriodKey(s.remoteCycle)
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

/** 재택 체크리스트 등록 주기 변경 — 담당·Admin (요구사항 54행 '등록 주기 변경 - 반기, 분기, 매일').
 *  제출·대상·통계·알림이 참조하는 s.remoteCycle 단일 원천을 바꾼다(정의된 값만 수용). */
async function setRemoteCycle(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/remote', 'BIZ_MGR', 'ADMIN')
  const cycle = String(formData.get('cycle') ?? '') as RemoteCycle
  if (!REMOTE_CYCLES.includes(cycle)) return
  const s = getStore()
  if (s.remoteCycle === cycle) return
  s.remoteCycle = cycle
  audit(me.name, '재택 대상자 변경', `등록 주기 변경 → ${cycle}`)
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
  const thisPeriod = remotePeriodKey(s.remoteCycle)
  // 기간별 조회 (요구사항 54행) — 담당은 과거 기간을 지정해 명단·제출을 함께 본다(기본 현 주기)
  const period = periodParam || thisPeriod
  const canManage = me.role !== 'USER'

  const submitted = s.remoteChecks.filter((r) => r.period === period)
  const mySubmitted = s.remoteChecks.find((r) => r.name === me.name && r.period === thisPeriod)
  const iAmTarget = s.remoteTargets.some((t) => t.name === me.name && isRemoteTargetIn(t, thisPeriod))

  // 현황 스코프 — 해당 월 재택 대상자 명단: 담당·Admin=전사, 부서담당=소속 부서, 사용자=본인만.
  // (통계도 뷰어 범위로 산출해야 한다 — 표·export 는 스코프되는데 stat 행만 전사 집계가 새던 결함)
  // 재직자 교집합 — remoteTargets 는 s.people 과 별개 명단이고 syncHr 는 s.people 만 교체하므로, 종료일 없는
  // 재택 대상자가 퇴사해 s.people 에서 빠져도 remoteTargets 엔 남아 매월 '미제출' 유령으로 집계됐다(제출·종료
  // 경로가 없어 해소 불가). 재직 명단과 교집합해 화면·통계에서 유령 미제출을 제거한다(인사연동 감사 v1.5.90).
  const targetsRaw = s.remoteTargets.filter((t) =>
    isRemoteTargetIn(t, period) && s.people.some((p) => p.name === t.name) &&
    (me.role === 'USER' ? t.name === me.name : me.role === 'DEPT_MGR' ? t.dept === me.dept : true))
  // 한 사람이 같은 달에 인접 기간 둘로 잡혀도(경계월 전환) 대상은 1명 — 이름 기준 중복 제거해
  // 대상·제출·미제출 통계가 이중 집계되지 않게 한다(월 단위 isRemoteTargetIn 방어).
  const targets = targetsRaw.filter((t, i) => targetsRaw.findIndex((x) => x.name === t.name) === i)
  const submittedInScope = targets.filter((t) => submitted.some((r) => r.name === t.name))
  const missing = targets.filter((t) => !submitted.some((r) => r.name === t.name))

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="재택근무 체크리스트"
        desc={`재택근무 보안 자가점검 (등록 주기: ${s.remoteCycle}) — 대상 명단은 일자별로 관리한다.`}
        right={!iAmTarget
          ? <Chip tone="neutral">재택 대상 아님</Chip>
          : mySubmitted
            ? <Chip tone="ok">이번 주기 제출 완료 · {mySubmitted.submittedAt}</Chip>
            : <Chip tone="warn">미제출</Chip>} />

      <div className="stat-row">
        <Stat value={submittedInScope.length} label={`${period} 제출`} note={`대상 ${targets.length}명`} />
        <Stat value={missing.length} label="미제출" tone={missing.length > 0 ? 'warn' : undefined} />
        <Stat value={!iAmTarget ? '대상 아님' : mySubmitted ? '완료' : '미제출'} label="내 제출 상태"
          tone={!iAmTarget || mySubmitted ? undefined : 'err'} />
      </div>

      {!iAmTarget ? (
        <div className="callout">
          <b>재택 대상 아님</b> — 이번 주기({thisPeriod}) 재택근무 대상자 명단에 없어 체크리스트 제출 대상이 아닙니다.
          재택 시작 시 담당자가 명단에 등록하면 제출할 수 있습니다.
        </div>
      ) : mySubmitted ? (
        <div className="callout">
          <b>제출 완료</b> — {mySubmitted.submittedAt} 제출. 다음 주기에 다시 제출 대상이 됩니다.
        </div>
      ) : (
        <Card title={`${thisPeriod} 자가점검 제출`}>
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
        <Card title={me.role === 'DEPT_MGR' ? `${me.dept} 제출 현황` : '전사 제출 현황'} pad={false}
          actions={
            <span className="hstack">
              <form method="get" className="hstack" style={{ gap: 4 }}>
                <input className="input" name="period" defaultValue={period}
                  type={s.remoteCycle === '매일' ? 'date' : s.remoteCycle === '월' ? 'month' : 'text'}
                  placeholder={s.remoteCycle === '분기' ? 'YYYY-Qn' : s.remoteCycle === '반기' ? 'YYYY-Hn' : undefined}
                  title="조회 기간 — 해당 등록 주기 기간의 재택 대상 명단 기준" style={{ height: 25, fontSize: 11, width: 118 }} />
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
        <Card title="대상자 관리 — 일자별 명단">
          <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>
            시작일자를 넣으면 신규 등록(기존 열린 기간은 전일로 마감), 종료일자만 넣으면 진행중 대상의 재택 종료 처리.
            업로드는 CSV 한 줄에 <span className="mono">이름,시작일자[,종료일자]</span> — 같은 규칙으로 행 단위 반영된다.
          </div>
          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap' }}>
            <form action={upsertTarget} className="hstack">
              <select aria-label="이름" className="select" name="name" required>
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
            <form action={setRemoteCycle} className="hstack" title="요구사항 54행 — 등록 주기(매일·월·분기·반기)">
              <span className="mut" style={{ fontSize: 12 }}>등록 주기</span>
              <select aria-label="등록 주기" className="select" name="cycle" defaultValue={s.remoteCycle}>
                {REMOTE_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn">주기 변경</button>
            </form>
          </div>
        </Card>
      )}
    </>
  )
}
