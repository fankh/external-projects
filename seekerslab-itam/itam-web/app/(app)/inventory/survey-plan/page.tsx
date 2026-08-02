import { ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { isStaleVerify, today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { PlanView } from './PlanView'

export const dynamic = 'force-dynamic'

export default async function SurveyPlanPage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  const t = today()

  // 대상 범위 후보는 공통코드 LOCATION 그룹 — 미사용 처리된 코드는 신규 계획에서 제외된다
  const scopes = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const assignees = s.users.filter((u) => u.role === 'ASSET_MGR').map((u) => u.name)

  // '미확인'은 실물 확인 전까지 계속 미확인으로 남으므로, 편성 대상은 아직 어떤 회차에도
  // 묶이지 않은 건수로 센다 — 이미 편성한 자산이 계속 대상으로 잡히면 카운트가 거짓이 된다
  const ghosts = s.discovered.filter((d) => d.state === '미확인')
  const composed = new Set(s.inventoryRounds.flatMap((r) => r.targets ?? []))
  const unconfirmed = ghosts.length
  const pendingCompose = ghosts.filter((g) => !composed.has(g.id)).length

  // 실사 데이터 기반 장기 미실측(유령) — 개시 전·진행 중 회차에 편성되지 않은 건이 자동 편성 대상
  const pendingRoundTargets = new Set(
    s.inventoryRounds.filter((r) => r.status !== '완료').flatMap((r) => r.targets ?? []),
  )
  const staleAssets = s.assets.filter(isStaleVerify)
  const staleVerify = staleAssets.length
  const pendingStaleCompose = staleAssets.filter((a) => !pendingRoundTargets.has(a.assetNo)).length

  const rounds = s.inventoryRounds
  const active = rounds.filter((r) => r.status === '진행중')
  const planned = rounds.filter((r) => r.status === '계획')
  const overdue = rounds.filter((r) => r.status !== '완료' && r.dueDate < t)

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Inventory Planning"
        title="재물조사 계획"
        desc="연간 / 수시 조사 계획 · 대상 범위와 담당자 지정 · 대사 미확인 자산 자동 편성"
      />

      <div className="stat-row">
        <Stat value={active.length} label="진행 중 회차" tone={active.length ? 'accent' : undefined} />
        <Stat value={planned.length} label="계획 수립 완료 — 개시 대기" />
        <Stat value={overdue.length} label="기한 경과" tone={overdue.length ? 'err' : 'ok'} />
        <Stat
          value={pendingCompose}
          label={`대사 미확인 편성 대기 — 전체 ${unconfirmed}건`}
          tone={pendingCompose ? 'warn' : 'ok'}
          delta={{ text: '유휴·분실 후보', dir: 'flat' }}
        />
        <Stat
          value={pendingStaleCompose}
          label={`장기 미실측 편성 대기 — 전체 ${staleVerify}건`}
          tone={pendingStaleCompose ? 'warn' : 'ok'}
          delta={{ text: '실사 기반 유령 후보', dir: 'flat' }}
        />
      </div>

      <PlanView
        rounds={rounds}
        scopes={scopes}
        assignees={assignees}
        unconfirmed={unconfirmed}
        pendingCompose={pendingCompose}
        staleVerify={staleVerify}
        pendingStaleCompose={pendingStaleCompose}
        today={t}
      />
    </>
  )
}
