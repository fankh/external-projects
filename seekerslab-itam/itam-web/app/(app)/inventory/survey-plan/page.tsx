import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { isStaleVerify, today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { PlanView } from './PlanView'

export const dynamic = 'force-dynamic'

export default async function SurveyPlanPage() {
  await requireView('/inventory/survey-plan', 'ASSET_MGR', 'ADMIN')
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
  const staleAssets = s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays))
  const staleVerify = staleAssets.length
  const pendingStaleCompose = staleAssets.filter((a) => !pendingRoundTargets.has(a.assetNo)).length

  const rounds = s.inventoryRounds
  const active = rounds.filter((r) => r.status === '진행중')
  const planned = rounds.filter((r) => r.status === '계획')
  const overdue = rounds.filter((r) => r.status !== '완료' && r.dueDate < t)
  // 완료 회차 이력 — 지난 재물조사의 실적(대상·실사·차이)을 남겨 감사 추적에 쓴다. 그동안 완료 회차는 조사 화면·계획 화면 어디에도 안 보였다.
  const completed = rounds.filter((r) => r.status === '완료').sort((a, b) => b.dueDate.localeCompare(a.dueDate))

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
        // 오늘 이미 독촉을 보낸 회차 — 서버가 당일 중복을 거절하므로 화면도 같은 판정을 보여 준다(눌러야 막히는 버튼 방지).
        remindedToday={s.dispatches.filter((m) => m.kind === '재물조사 독촉' && m.at.startsWith(t)).map((m) => m.ref ?? '')}
        rounds={rounds.filter((r) => r.status !== '완료')}
        scopes={scopes}
        assignees={assignees}
        unconfirmed={unconfirmed}
        pendingCompose={pendingCompose}
        staleVerify={staleVerify}
        pendingStaleCompose={pendingStaleCompose}
        today={t}
        staleVerifyDays={s.opsPolicy.staleVerifyDays}
      />

      <Card kicker="History" title={`완료 회차 이력 · ${completed.length}건`} pad={false}>
        {completed.length === 0 ? (
          <div className="empty">완료된 재물조사 회차가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>회차</th><th className="c">구분</th><th>대상 범위</th><th className="num">대상</th><th className="num">실사</th><th className="num">차이</th><th>담당자</th><th>기준일</th></tr>
              </thead>
              <tbody>
                {completed.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.name}<div className="dim" style={{ fontSize: 11 }}>{r.id}</div></td>
                    <td className="c"><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="dim">{r.scope}</td>
                    <td className="num tnum">{r.planned.toLocaleString()}</td>
                    <td className="num tnum">{r.scanned.toLocaleString()}</td>
                    <td className="num tnum">{r.mismatched > 0 ? <Chip tone="warn" bare>{r.mismatched}</Chip> : 0}</td>
                    <td>{r.assignee}</td>
                    <td className="tnum">{r.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="callout" style={{ margin: 14 }}>
          <b>재물조사 감사 추적.</b> 완료된 회차의 대상·실사·차이 실적을 보존합니다. 회차 완료 시 결과 요약 리포트가 자동 생성되어
          담당·IT기획팀에 배포됩니다(로36). 차이는 조정 결재를 거쳐 대장에 반영된 뒤 완료됩니다.
        </div>
      </Card>
    </>
  )
}
