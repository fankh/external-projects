import { ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { UsersView } from './UsersView'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await requireRole('ADMIN')
  const s = getStore()

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Users · Groups · Approval"
        title="사용자 · 그룹 · 결재선"
        desc="STEP 4 — 사용자그룹 배정과 화면별 기본 결재선 관리 · 폐기 · 격리 · 편입은 필수 결재로 고정"
      />

      <div className="stat-row">
        <Stat value={s.users.length} label="등록 사용자" />
        <Stat value={new Set(s.users.map((u) => u.group)).size} label="사용자그룹" />
        <Stat value={s.users.filter((u) => u.mfa).length} label="MFA 적용" tone="ok" delta={{ text: `미적용 ${s.users.filter((u) => !u.mfa).length}명`, dir: 'flat' }} />
        <Stat value={s.approvalLines.filter((l) => l.required).length} label="필수 결재 화면" tone="warn" />
      </div>

      <UsersView users={s.users} lines={s.approvalLines} me={session.login} />
    </>
  )
}
