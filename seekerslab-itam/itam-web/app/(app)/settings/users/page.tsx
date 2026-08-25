import { ScreenHeader, Stat } from '@/components/ui'
import { mfaRemindTargets } from '@/lib/reminders'
import { requireView } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { GONE_STATUSES } from '@/lib/types'
import { UsersView } from './UsersView'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await requireView('/settings/users', 'ADMIN')
  const s = getStore()
  // 사용자별 보유 자산 수 — 손 떠난 자산(GONE_STATUSES: 분실·폐기예정·폐기완료)을 뺀 집계. 계정 관리 시
  //  자산 부담·재배치 판단에 쓴다. 여기서 상태 목록을 따로 적으면 대장 드릴다운(live=1)과 판정이 갈려
  //  "보유 3" 을 눌렀는데 목록이 4건인 상태가 된다 — 손 떠난 자산 판정은 lib/types 한 곳에서 온다.
  const owned: Record<string, number> = {}
  for (const a of s.assets) {
    if (GONE_STATUSES.includes(a.status)) continue
    owned[a.owner] = (owned[a.owner] ?? 0) + 1
  }
  // 오프보딩 요약 — 퇴직·부서이동 시 회수·재배정 대상을 한 사람 기준으로 모은다(대장 소유자 검색·라이선스 좌석·대여가 흩어져 있던 것).
  //  사용중 보유(일괄 회수 대상)·대여중·배정 라이선스 좌석·미처리 상신 결재를 사용자별로 집계한다. 담당자 자산 회수(로 오프보딩)의 진입 요약.
  const offboard: Record<string, { inUse: number; loaned: number; seats: { lic: string; assetNo: string }[]; pendingReqs: number }> = {}
  const bump = (name: string) => (offboard[name] ??= { inUse: 0, loaned: 0, seats: [], pendingReqs: 0 })
  for (const a of s.assets) {
    if (a.status === '사용중') bump(a.owner).inUse += 1
    else if (a.status === '대여중') bump(a.owner).loaned += 1
  }
  // 해지 라이선스 좌석은 오프보딩 회수 대상이 아니다(라이선스 종료) — 오프보딩 확인서(offboard-sheet)는 이미 해지 제외하나 이 화면 집계가 빠뜨려 과다 계상하던 것 정합(화면=증적).
  for (const l of s.licenses) { if (l.status === '해지') continue; for (const st of l.seats ?? []) bump(st.user).seats.push({ lic: l.name, assetNo: st.assetNo }) }
  for (const ap of s.approvals) if (ap.status === '대기' && ap.requester) bump(ap.requester).pendingReqs += 1

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

      <UsersView mfaRemindCount={mfaRemindTargets().length} mfaPending={mfaRemindTargets().map((u) => u.login)} users={s.users} lines={s.approvalLines} me={session.login} owned={owned} offboard={offboard} />
    </>
  )
}
