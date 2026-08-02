import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { sendVia } from '@/lib/integrations/registry'
import { getStore, nextNo } from '@/lib/store'
import type { PledgeKind } from '@/lib/types'

const YEAR = '2026'

function unsignedOf(s: ReturnType<typeof getStore>) {
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signed = new Set(s.pledges.filter((p) => p.year === YEAR && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  return s.people.filter((p) => !signed.has(p.name))
}

/** 양식 개정 — 개정일자 이전 서약이 무효가 되어 전원 재서약 대상으로 재산출된다 (요구사항: 개정일 기준 안내) */
async function reviseForm(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const kind = String(formData.get('kind') ?? '') as PledgeKind
  const revisedAt = String(formData.get('revisedAt') ?? '')
  const s = getStore()
  const form = s.pledgeForms.find((f) => f.kind === kind)
  if (!form || !/^\d{4}-\d{2}-\d{2}$/.test(revisedAt) || revisedAt <= form.revisedAt) return
  form.revisedAt = revisedAt

  if (kind === '일반') {
    // 폐쇄 루프 — 재서약 대상에게 '보안서약서' 할일이 다시 생기고 안내메일이 나간다
    const targets = unsignedOf(s)
    const year = today().slice(0, 4)
    for (const p of targets) {
      if (!s.todos.some((t) => t.owner === p.name && t.kind === '보안서약서' && !t.done)) {
        s.todos.unshift({
          id: nextNo('TD', year, s.todos.map((t) => t.id)),
          owner: p.name, kind: '보안서약서', title: `${YEAR}년 일반 보안서약서 재서약 (개정 ${revisedAt})`,
          dueDate: revisedAt, done: false,
        })
      }
    }
    await sendVia('groupware-mail', targets.map((p) => p.name), `[보안서약서] 양식 개정(${revisedAt}) — 재서약 안내`)
  }
  revalidatePath('/', 'layout')
}

/** 스캔본 업로드 — 그룹웨어 계정이 없는 재직자의 서면 서약을 대리 등록 (부서현황에 자동 반영) */
async function uploadScan(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const s = getStore()
  const person = s.people.find((p) => p.name === name)
  if (!person || !unsignedOf(s).some((p) => p.name === name)) return
  s.pledges.push({ name: person.name, dept: person.dept, year: YEAR, kind: '일반', signedAt: today(), method: '서면(스캔)' })
  const todo = s.todos.find((t) => t.owner === name && t.kind === '보안서약서' && !t.done)
  if (todo) todo.done = true
  revalidatePath('/', 'layout')
}

async function toggleOfficer(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const s = getStore()
  if (!s.people.some((p) => p.name === name)) return
  s.securityOfficers = s.securityOfficers.includes(name)
    ? s.securityOfficers.filter((n) => n !== name)
    : [...s.securityOfficers, name]
  revalidatePath('/pledge/manage')
}

export default async function ManagePledgePage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const unsigned = unsignedOf(s)
  const rate = s.people.length ? Math.round(((s.people.length - unsigned.length) / s.people.length) * 100) : 0

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="전사 현황 · 양식관리"
        desc="전사 서약 진행현황과 서약서 양식(개정일자), 보안담당자, 서면 스캔본 등록을 관리한다." />

      <div className="stat-row">
        <Stat value={s.people.length} label="전사 대상" />
        <Stat value={`${rate}%`} label="서약률" tone={rate < 100 ? 'warn' : undefined} />
        <Stat value={unsigned.length} label="미서약" tone={unsigned.length > 0 ? 'err' : undefined} />
        <Stat value={s.securityOfficers.length} label="보안담당자" note="특별서약 대상" />
      </div>

      <div className="cols c2">
        <Card title="양식관리 — 개정일자" kicker="Forms" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>서약서 양식</th><th>개정일자</th><th className="c">개정</th></tr></thead>
              <tbody>
                {s.pledgeForms.map((f) => (
                  <tr key={f.kind}>
                    <td className="strong">{f.kind} 보안서약서 <span className="mut">(HTML)</span></td>
                    <td className="tnum">{f.revisedAt}</td>
                    <td className="c">
                      <form action={reviseForm} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                        <input type="hidden" name="kind" value={f.kind} />
                        <input className="input" name="revisedAt" required type="date" style={{ height: 25, fontSize: 11.5 }} />
                        <button type="submit" className="btn sm">개정</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dim" style={{ fontSize: 11.5, padding: '8px 14px' }}>
            일반 서약서 개정 시 개정일 이전 서약은 무효가 되어 전원 재서약 대상으로 재산출되고,
            할일 생성·안내메일 발송이 자동으로 실행된다.
          </div>
        </Card>

        <Card title="미서약자 — 스캔본 업로드" kicker="Upload" pad={false}>
          {unsigned.length === 0 ? (
            <div className="empty">미서약자가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>이름</th><th>부서</th><th className="c">서면 서약 등록</th></tr></thead>
                <tbody>
                  {unsigned.map((p) => (
                    <tr key={p.name}>
                      <td className="strong">{p.name}</td>
                      <td>{p.dept}</td>
                      <td className="c">
                        <form action={uploadScan} style={{ display: 'inline' }}>
                          <input type="hidden" name="name" value={p.name} />
                          <button type="submit" className="btn sm">스캔본 업로드</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="보안담당자 관리" kicker="Officers" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>부서</th><th>보안담당자</th><th className="c">지정 · 해제</th></tr></thead>
            <tbody>
              {s.people.map((p) => {
                const isOfficer = s.securityOfficers.includes(p.name)
                return (
                  <tr key={p.name}>
                    <td className="strong">{p.name}</td>
                    <td>{p.dept}</td>
                    <td>{isOfficer ? <Chip tone="info">보안담당자</Chip> : <span className="mut">-</span>}</td>
                    <td className="c">
                      <form action={toggleOfficer} style={{ display: 'inline' }}>
                        <input type="hidden" name="name" value={p.name} />
                        <button type="submit" className={`btn sm ${isOfficer ? 'danger' : ''}`}>{isOfficer ? '해제' : '지정'}</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="dim" style={{ fontSize: 11.5, padding: '8px 14px' }}>
          일반서약서 동의 후 특별서약서 대상자로 관리된다 — 특별서약 화면은 이후 버전.
        </div>
      </Card>
    </>
  )
}
