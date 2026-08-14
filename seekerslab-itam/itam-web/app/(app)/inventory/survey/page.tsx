import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { roundProgressPct } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { SurveyConsole } from './SurveyConsole'
import { UnscannedTargets } from './UnscannedTargets'

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

  // 실사 위치 목록의 원천은 공통코드 LOCATION 그룹 — 미사용 처리된 코드는 제외된다
  const locations = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const scans = s.surveyScans.filter((x) => x.roundId === round.id)
  const diffs = s.surveyDiffs.filter((d) => d.roundId === round.id)
  const pendingDiffs = diffs.filter((d) => d.status === '미조치')
  const progress = roundProgressPct(round)

  // 미실사 남은 대상 — 자동 편성 회차(대상 자산번호 목록)에서 아직 스캔되지 않은 대상. 실사자가 "무엇을 더 찾아야 하는지" 알도록
  // 노출한다(제품안내서 §03·§04 미확인 자산 확인). 마감까지 미스캔분은 분실 후보로 남는다. 위치-scope 회차(targets 없음)는 대상 아님.
  const scannedNos = new Set(scans.map((x) => x.assetNo).filter(Boolean))
  const unscannedTargets = (round.targets ?? [])
    .filter((no) => !scannedNos.has(no))
    .map((no) => {
      const a = s.assets.find((x) => x.assetNo === no)
      // 이미 분실·폐기 처리된 대장 자산은 대상에서 제외 — 조치가 끝난 것을 다시 '미실사'로 보여주지 않는다.
      if (a && ['분실', '폐기예정', '폐기완료'].includes(a.status)) return null
      if (a) return { ref: no, label: a.model, location: a.location, note: a.lastVerifiedAt ? `최근 실측 ${a.lastVerifiedAt}` : '실측 이력 없음', inLedger: true }
      const d = s.discovered.find((x) => x.id === no)
      if (d) return { ref: no, label: `${d.hostname} · ${d.type}`, location: d.ip ?? '-', note: `발견 ${d.channel} · 최근 ${d.lastSeen}`, inLedger: false }
      return { ref: no, label: '-', location: '-', note: '대장·발견 저장소 확인 필요', inLedger: false }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)

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

      {unscannedTargets.length > 0 && <UnscannedTargets targets={unscannedTargets} roundName={round.name} />}

      <SurveyConsole
        roundId={round.id}
        roundName={round.name}
        roundStatus={round.status}
        scans={scans}
        diffs={diffs}
        assignee={round.assignee}
        me={session.name}
        locations={locations}
      />
    </>
  )
}
