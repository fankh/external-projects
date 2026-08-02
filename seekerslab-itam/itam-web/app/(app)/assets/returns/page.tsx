import { ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil, isLoanDueSoon, isLoanOverdue, today } from '@/lib/dates'
import { canExport } from '@/lib/exports'
import { getStore } from '@/lib/store'
import { ReturnsView } from './ReturnsView'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  const session = await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()

  const pending = s.assets
    .filter((a) => a.status === '반납대기')
    .map((a) => {
      const ap = s.approvals.find((x) => x.kind === '반납' && x.refId === a.assetNo && x.status === '승인')
      return {
        assetNo: a.assetNo, model: a.model, owner: a.owner, dept: a.dept, location: a.location,
        since: ap?.decidedAt ?? ap?.requestedAt ?? '-',
      }
    })

  // 유휴 경과일 — 마지막 반납·점검·수리 이력 기준. 오래 묵을수록 재배치나 폐기 검토 대상이다
  const idle = s.assets
    .filter((a) => a.status === '유휴')
    .map((a) => {
      const last = [...a.history].reverse().find((h) => h.kind === '반납' || h.kind === '점검' || h.kind === '수리')
      const d = last ? daysUntil(last.date) : null
      return {
        assetNo: a.assetNo, model: a.model, category: a.category, location: a.location,
        idleDays: d === null ? null : Math.max(0, -d),
      }
    })
    .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1))

  // 수리중 자산 — 반납 점검에서 '수리 필요'로 판정돼 수리를 기다리는 자산
  const repairing = s.assets
    .filter((a) => a.status === '수리중')
    .map((a) => {
      const last = [...a.history].reverse().find((h) => h.kind === '반납' || h.kind === '수리')
      return { assetNo: a.assetNo, model: a.model, category: a.category, location: a.location, note: last?.detail ?? '' }
    })

  // 대여 현황 — 반출(대여중) 자산을 한 곳에 모아 반환 기한·연체를 관리한다. 그동안 대여 반환·연장은
  // 자산 대장 상세에 자산별로 흩어져 있어, 담당자가 "무엇이 언제까지 나가 있는지"를 한눈에 볼 곳이 없었다.
  // 반환이 임박·경과한 순으로 정렬한다(기한 없는 건은 뒤로).
  const loans = s.assets
    .filter((a) => a.status === '대여중')
    .map((a) => ({
      assetNo: a.assetNo, model: a.model, owner: a.owner, dept: a.dept,
      dueDate: a.loanDueDate ?? '-',
      dday: a.loanDueDate ? daysUntil(a.loanDueDate) : null,
      overdue: isLoanOverdue(a),
    }))
    .sort((x, y) => (x.dday ?? 99_999) - (y.dday ?? 99_999))
  const overdueLoans = loans.filter((l) => l.overdue).length
  // 독촉 대상 — 연체 + 반환 임박(D-7). 대여자에게 반환 요청을 보낼 수 있는 건수
  const remindable = s.assets.filter((a) => isLoanOverdue(a) || isLoanDueSoon(a)).length
  const todayStr = today()

  const locations = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const openRequests = s.approvals.filter(
    (a) => a.kind === '자산 신청' && a.status === '승인' && !a.fulfilled && !a.refId?.startsWith('DSC-'),
  ).length

  const longIdle = idle.filter((a) => (a.idleDays ?? 0) >= 90).length

  return (
    <>
      <ScreenHeader
        kicker="자산관리 — Lifecycle Phase 4"
        title="반납 · 유휴"
        desc="반납 접수 · 상태 점검 · 유휴 자산 풀 관리 (재배치 우선 원칙)"
      />

      <div className="stat-row">
        <Stat value={pending.length} label="반납 접수 대기" tone={pending.length ? 'accent' : 'ok'} />
        <Stat value={repairing.length} label="수리중" tone={repairing.length ? 'warn' : 'ok'} />
        <Stat value={loans.length} label="대여중" tone={loans.length ? 'accent' : 'ok'} delta={overdueLoans ? { text: `연체 ${overdueLoans}건`, dir: 'up' } : undefined} />
        <Stat value={idle.length} label="유휴 자산 풀" />
        <Stat value={longIdle} label="90일 이상 장기 유휴" tone={longIdle ? 'warn' : 'ok'} delta={{ text: '재배치·폐기 검토', dir: 'flat' }} />
        <Stat value={openRequests} label="배정 대기 자산 신청" tone={openRequests ? 'accent' : 'ok'} />
      </div>

      <ReturnsView pending={pending} idle={idle} repairing={repairing} loans={loans} remindable={remindable} canExportLoans={canExport('loans', session.role)} today={todayStr} locations={locations} openRequests={openRequests} />
    </>
  )
}
