import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { roundProgressPct } from '@/lib/dates'
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
      if (a) return { ref: no, label: a.model, location: a.location, note: a.lastVerifiedAt ? `최근 실측 ${a.lastVerifiedAt}` : '실측 이력 없음' }
      const d = s.discovered.find((x) => x.id === no)
      if (d) return { ref: no, label: `${d.hostname} · ${d.type}`, location: d.ip ?? '-', note: `발견 ${d.channel} · 최근 ${d.lastSeen}` }
      return { ref: no, label: '-', location: '-', note: '대장·발견 저장소 확인 필요' }
    })

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

      {unscannedTargets.length > 0 && (
        <Card kicker="Follow-up · 미실사" title={`미실사 남은 대상 — ${unscannedTargets.length}건 (유령 자산 후보)`} pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>대상</th><th>모델 · 유형</th><th>대장 위치 · IP</th><th>실측 이력</th></tr></thead>
              <tbody>
                {unscannedTargets.map((t) => (
                  <tr key={t.ref}>
                    <td className="code">{t.ref}</td>
                    <td className="strong">{t.label}</td>
                    <td className="dim">{t.location}</td>
                    <td className="tnum">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            이 회차는 미확인·장기 미실측(유령 자산 후보)에서 자동 편성됐습니다. 위 대상을 현장에서 스캔하면 실측이 확인되고,
            마감까지 미스캔분은 분실 후보로 남습니다 — 실사자가 무엇을 더 찾아야 하는지 한눈에 드러냅니다.
          </div>
        </Card>
      )}

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
