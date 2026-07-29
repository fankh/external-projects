import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { SurveyConsole } from './SurveyConsole'

export const dynamic = 'force-dynamic'

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  await requireRole('ASSET_MGR', 'ADMIN')
  const session = (await getSession())!
  const { round: roundParam } = await searchParams
  const s = getStore()

  const rounds = s.inventoryRounds.filter((r) => r.status !== '완료')
  const round = rounds.find((r) => r.id === roundParam) ?? rounds.find((r) => r.status === '진행중') ?? rounds[0]
  if (!round) {
    return (
      <>
        <ScreenHeader kicker="재고 · 계약 — Physical Inventory" title="재물조사 수행" />
        <Card><div className="empty">진행 중이거나 계획된 조사 회차가 없습니다.</div></Card>
      </>
    )
  }

  const scans = s.surveyScans.filter((x) => x.roundId === round.id)
  const diffs = s.surveyDiffs.filter((d) => d.roundId === round.id)
  const pendingDiffs = diffs.filter((d) => d.status === '미조치')
  const progress = Math.round((round.scanned / round.planned) * 100)

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Physical Inventory"
        title="재물조사 수행"
        desc="바코드/QR 스캔 실사 · 대장 대비 과부족 확인 → 조정 결재 → 반영 (모바일 웹 지원)"
        right={<Chip tone={round.status === '진행중' ? 'info' : 'neutral'}>{round.name}</Chip>}
      />

      <div className="stat-row">
        <Stat value={`${progress}%`} label={`진행률 — ${round.scanned.toLocaleString()} / ${round.planned.toLocaleString()}`} tone="ok" />
        <Stat value={scans.filter((x) => x.result === '일치').length} label="이번 세션 일치 확인" />
        <Stat value={diffs.length} label="차이 항목" tone={diffs.length ? 'warn' : 'ok'} />
        <Stat value={pendingDiffs.length} label="조정 미상신" tone={pendingDiffs.length ? 'err' : 'ok'} delta={{ text: '차이 조정은 필수 결재', dir: 'flat' }} />
      </div>

      <SurveyConsole
        roundId={round.id}
        roundName={round.name}
        scans={scans}
        diffs={diffs}
        assignee={round.assignee}
        me={session.name}
      />
    </>
  )
}
