import { ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { ReturnsView } from './ReturnsView'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  await requireRole('ASSET_MGR', 'ADMIN')
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

  // 유휴 경과일 — 마지막 반납·점검 이력 기준. 오래 묵을수록 재배치나 폐기 검토 대상이다
  const idle = s.assets
    .filter((a) => a.status === '유휴')
    .map((a) => {
      const last = [...a.history].reverse().find((h) => h.kind === '반납' || h.kind === '점검')
      const d = last ? daysUntil(last.date) : null
      return {
        assetNo: a.assetNo, model: a.model, category: a.category, location: a.location,
        idleDays: d === null ? null : Math.max(0, -d),
      }
    })
    .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1))

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
        <Stat value={idle.length} label="유휴 자산 풀" />
        <Stat value={longIdle} label="90일 이상 장기 유휴" tone={longIdle ? 'warn' : 'ok'} delta={{ text: '재배치·폐기 검토', dir: 'flat' }} />
        <Stat value={openRequests} label="배정 대기 자산 신청" tone={openRequests ? 'accent' : 'ok'} />
      </div>

      <ReturnsView pending={pending} idle={idle} locations={locations} openRequests={openRequests} />
    </>
  )
}
