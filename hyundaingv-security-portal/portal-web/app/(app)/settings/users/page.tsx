import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireRole } from '@/lib/authz'
import { ACCOUNTS } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ROLE_LABEL } from '@/lib/types'

const ROLE_CHIP: Record<string, 'neutral' | 'info' | 'warn' | 'err'> = {
  USER: 'neutral', DEPT_MGR: 'info', BIZ_MGR: 'warn', ADMIN: 'err',
}

async function updateLine(formData: FormData) {
  'use server'
  const me = await requireRole('ADMIN')
  const docType = String(formData.get('docType') ?? '')
  const approver = String(formData.get('approver') ?? '')
  const s = getStore()
  const line = s.approvalLines.find((l) => l.docType === docType)
  // 결재자는 담당 권한 이상만 지정 가능 — 목업 계정 중 비사용자
  const valid = ACCOUNTS.some((a) => a.name === approver && a.role !== 'USER')
  if (!line || !valid || line.approver === approver) return
  audit(me.name, '결재선 변경', `${docType}: ${line.approver} → ${approver}`)
  line.approver = approver
  revalidatePath('/', 'layout')
}

export default async function UsersPage() {
  await requireMenu('/settings/users')
  const s = getStore()
  const approverCandidates = ACCOUNTS.filter((a) => a.role !== 'USER')

  return (
    <>
      <ScreenHeader kicker="환경설정" title="사용자 · 그룹 · 결재선"
        desc="인사정보 연동 계정과 권한그룹, 문서 유형별 기본 결재선을 관리한다 — 결재선 변경은 이후 상신부터 적용된다." />

      <div className="stat-row">
        <Stat value={s.people.length} label="사용자" note="인사정보 연동" />
        <Stat value={ACCOUNTS.length} label="권한그룹 계정" note="사용자·부서담당·업무담당·Admin" />
        <Stat value={s.approvalLines.length} label="기본 결재선" note="문서 유형별" />
      </div>

      <div className="cols c2">
        <Card title="사용자 목록" kicker="Users" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>이름</th><th>부서</th><th>권한그룹</th><th>재직상태</th></tr></thead>
              <tbody>
                {s.people.map((p) => {
                  const acct = ACCOUNTS.find((a) => a.name === p.name)
                  const role = acct?.role ?? 'USER'
                  return (
                    <tr key={p.name}>
                      <td className="strong">{p.name}</td>
                      <td>{p.dept}</td>
                      <td><Chip tone={ROLE_CHIP[role]} bare>{ROLE_LABEL[role]}</Chip></td>
                      <td><Chip tone="ok" bare>재직</Chip></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="결재선 관리 — 문서 유형별 기본 결재자" kicker="Approval Lines" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>문서 유형</th><th>현재 결재자</th><th className="c">변경</th></tr></thead>
              <tbody>
                {s.approvalLines.map((l) => (
                  <tr key={l.docType}>
                    <td className="strong">{l.docType}</td>
                    <td>{l.approver}</td>
                    <td className="c">
                      <form action={updateLine} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                        <input type="hidden" name="docType" value={l.docType} />
                        <select className="select" name="approver" defaultValue={l.approver} style={{ height: 25, fontSize: 11.5 }}>
                          {approverCandidates.map((a) => <option key={a.login} value={a.name}>{a.name}</option>)}
                        </select>
                        <button type="submit" className="btn sm">저장</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dim" style={{ fontSize: 11.5, padding: '8px 14px' }}>
            기안자 본인이 결재자인 문서는 자동으로 차상위(시스템관리자)로 대체된다 — 자기 결재 방지.
          </div>
        </Card>
      </div>
    </>
  )
}
