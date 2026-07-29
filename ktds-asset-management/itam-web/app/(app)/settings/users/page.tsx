import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { ROLE_LABEL, type Role } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ROLE_TONE: Record<Role, 'neutral' | 'info' | 'warn' | 'err'> = {
  USER: 'neutral', ASSET_MGR: 'info', SEC_MGR: 'warn', ADMIN: 'err',
}

export default async function UsersPage() {
  await requireRole('ADMIN')
  const s = getStore()

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Users · Groups · Approval"
        title="사용자 · 그룹 · 결재선"
        desc="사용자그룹 배정과 화면별 기본 결재선 관리 — 폐기 · 격리 · 편입은 필수 결재"
      />

      <div className="stat-row">
        <Stat value={s.users.length} label="등록 사용자" />
        <Stat value={new Set(s.users.map((u) => u.group)).size} label="사용자그룹" />
        <Stat value={s.users.filter((u) => u.mfa).length} label="MFA 적용" tone="ok" delta={{ text: `미적용 ${s.users.filter((u) => !u.mfa).length}명`, dir: 'flat' }} />
        <Stat value={s.approvalLines.filter((l) => l.required).length} label="필수 결재 화면" tone="warn" />
      </div>

      <Card kicker="Users" title="사용자 · 그룹" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>계정</th><th>이름</th><th>부서</th><th>사용자그룹</th><th className="c">권한그룹</th><th className="c">MFA</th><th>최근 로그인</th></tr>
            </thead>
            <tbody>
              {s.users.map((u) => (
                <tr key={u.login}>
                  <td className="code">{u.login}</td>
                  <td className="strong">{u.name}</td>
                  <td className="mute">{u.dept}</td>
                  <td>{u.group}</td>
                  <td className="c"><Chip tone={ROLE_TONE[u.role]} bare>{ROLE_LABEL[u.role]}</Chip></td>
                  <td className="c">{u.mfa ? <Chip tone="ok">적용</Chip> : <Chip tone="warn">미적용</Chip>}</td>
                  <td className="tnum mute">{u.lastLogin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Approval Lines" title="화면별 기본 결재선" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>화면</th><th>결재 구분</th><th>결재선</th><th className="c">필수 여부</th></tr></thead>
            <tbody>
              {s.approvalLines.map((l) => (
                <tr key={l.id}>
                  <td className="strong">{l.screen}</td>
                  <td className="mute">{l.kind}</td>
                  <td>
                    <span className="flow">
                      {l.steps.map((st, i) => (
                        <span key={st} style={{ display: 'contents' }}>
                          {i > 0 && <span className="ar">→</span>}
                          <span className="fs">{st}</span>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="c">{l.required ? <Chip tone="err">필수 결재</Chip> : <Chip tone="neutral">선택</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>화면별 기본 결재선.</b> 각 화면의 상신은 여기 정의된 결재선을 기본값으로 사용합니다. 폐기 · 격리 요청 ·
          발견 자산 편입 · 재물조사 차이 조정은 필수 결재로 지정되어 결재 없이 대장에 반영할 수 없습니다.
        </div>
      </Card>
    </>
  )
}
